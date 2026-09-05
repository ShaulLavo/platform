import { DEFAULT_PROVIDER_INSTANCE_ID, projectIdSchema, threadIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { activeServerOrigin } from '@/lib/client'
import { createChatTransport } from '@/features/chat/transport/create-chat-transport'
import {
  fetchOrchestrationShellSnapshotHttp,
  fetchOrchestrationThreadDetailSnapshotHttp,
} from '@/features/chat/transport/orchestration-http-snapshots'
import { isBlockedStreamError } from '@/features/chat/utils/stream-reconnect'
import { expect, test } from '../../../../../test/fixtures'

type CommandClient = { orchestration: { commands: { post: Function } } }

const PROJECT_ID = v.parse(projectIdSchema, 'project-http-snapshots')
const THREAD_ID = v.parse(threadIdSchema, 'thread-http-snapshots')

test('the shell snapshot loads over HTTP with contract-shaped dates', async ({ client }) => {
  await seedThread(client)

  const snapshot = await fetchOrchestrationShellSnapshotHttp(client)

  expect(snapshot.projects.map((project) => project.id)).toContain(PROJECT_ID)
  expect(snapshot.threads.map((thread) => thread.id)).toContain(THREAD_ID)
  // Eden revives date-shaped strings into `Date`. A snapshot handed to the
  // projection writers with live `Date`s no longer matches the contracts, and
  // nothing downstream notices until a comparison silently stops working.
  expect(typeof snapshot.updatedAt).toBe('string')
  expect(typeof snapshot.threads[0]?.createdAt).toBe('string')
})

test('the thread detail snapshot loads over HTTP with contract-shaped dates', async ({
  client,
}) => {
  await seedThread(client)

  const snapshot = await fetchOrchestrationThreadDetailSnapshotHttp(THREAD_ID, client)

  expect(snapshot.thread.id).toBe(THREAD_ID)
  expect(snapshot.snapshotSequence).toBeGreaterThan(0)
  expect(typeof snapshot.thread.createdAt).toBe('string')
})

test('the local chat transport reads thread detail over HTTP', async ({ client }) => {
  await seedThread(client)

  const snapshot = await createChatTransport(activeServerOrigin()).threadDetailSnapshot(THREAD_ID)

  expect(snapshot.thread.title).toBe('HTTP snapshot thread')
})

test('an HTTP snapshot failure classifies the same way the RPC error did', async ({ client }) => {
  await seedThread(client)
  const missing = v.parse(threadIdSchema, 'thread-missing')

  const failure = await rejection(fetchOrchestrationThreadDetailSnapshotHttp(missing, client))

  // The reconnect ladder parks on this instead of retrying forever, exactly as
  // it did when the read arrived as a structured RPC error over the socket.
  expect(failure).toMatchObject({ code: 'orchestration.THREAD_NOT_FOUND', status: 404 })
  expect(isBlockedStreamError(failure)).toBe(true)
})

async function seedThread(client: CommandClient) {
  await dispatch(client, {
    commandId: 'cmd-http-snapshots-project',
    defaultModelSelection: null,
    projectId: PROJECT_ID,
    title: 'HTTP snapshots',
    type: 'project.create',
    workspaceRoot: '/workspace/http-snapshots',
  })
  await dispatch(client, {
    commandId: 'cmd-http-snapshots-thread',
    modelSelection: { model: 'mock-model', providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID },
    projectId: PROJECT_ID,
    threadId: THREAD_ID,
    title: 'HTTP snapshot thread',
    type: 'thread.create',
  })
}

async function dispatch(client: CommandClient, command: unknown) {
  const response = await client.orchestration.commands.post(command)
  expect(response.error).toBeNull()
}

/** Settles with the rejection reason so the assertion can read its structure. */
function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error,
  )
}
