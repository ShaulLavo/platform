import {
  DEFAULT_PROVIDER_INSTANCE_ID,
  healthDescriptorSchema,
  orchestrationDispatchResultSchema,
  sessionIdSchema,
} from '@workspace/contracts'
import * as v from 'valibot'

import { activeServerOrigin } from '@/lib/client'
import { createChatTransport } from '@/features/chat/transport/create-chat-transport'
import {
  fetchOrchestrationShellSnapshotHttp,
  fetchOrchestrationSessionDetailSnapshotHttp,
} from '@/features/chat/transport/orchestration-http-snapshots'
import { isBlockedStreamError } from '@/features/chat/utils/stream-reconnect'
import { expect, test } from '../../../../../test/fixtures'

import { useEnvironmentsStore } from '@/lib/environments/state/store'

type CommandClient = { orchestration: { commands: { post: Function } } }

const SESSION_ID = v.parse(sessionIdSchema, '13d34191-7de3-59bd-b481-d19aa57f4e57')

test('the shell snapshot loads over HTTP with contract-shaped dates', async ({
  client,
  server,
}) => {
  await seedSession(client, server.root)

  const snapshot = await fetchOrchestrationShellSnapshotHttp(client)

  expect(snapshot.projects).toHaveLength(1)
  expect(snapshot.sessions.map((session) => session.id)).toContain(SESSION_ID)
  // Eden revives date-shaped strings into `Date`. A snapshot handed to the
  // projection writers with live `Date`s no longer matches the contracts, and
  // nothing downstream notices until a comparison silently stops working.
  expect(typeof snapshot.updatedAt).toBe('string')
  expect(typeof snapshot.sessions[0]?.createdAt).toBe('string')
})

test('the session detail snapshot loads over HTTP with contract-shaped dates', async ({
  client,
  server,
}) => {
  await seedSession(client, server.root)

  const snapshot = await fetchOrchestrationSessionDetailSnapshotHttp(SESSION_ID, client)

  expect(snapshot.session.id).toBe(SESSION_ID)
  expect(snapshot.snapshotSequence).toBeGreaterThan(0)
  expect(typeof snapshot.session.createdAt).toBe('string')
})

test('the local chat transport reads session detail over HTTP', async ({ client, server }) => {
  await seedSession(client, server.root)

  useEnvironmentsStore
    .getState()
    .recordDescriptor(
      activeServerOrigin(),
      v.parse(healthDescriptorSchema, (await client.health.get()).data),
    )
  const transport = createChatTransport(activeServerOrigin())
  const snapshot = await transport.sessionDetailSnapshot(SESSION_ID)
  transport.close()

  expect(snapshot.session.title).toBe('HTTP snapshot session')
})

test('an HTTP snapshot failure classifies the same way the RPC error did', async ({
  client,
  server,
}) => {
  await seedSession(client, server.root)
  const missing = v.parse(sessionIdSchema, 'cae3c004-d478-5f28-a6ee-2fef36d98da9')

  const failure = await rejection(fetchOrchestrationSessionDetailSnapshotHttp(missing, client))

  // The reconnect ladder parks on this instead of retrying forever, exactly as
  // it did when the read arrived as a structured RPC error over the socket.
  expect(failure).toMatchObject({ code: 'orchestration.SESSION_NOT_FOUND', status: 404 })
  expect(isBlockedStreamError(failure)).toBe(true)
})

async function seedSession(client: CommandClient, rootPath: string) {
  const receipt = await dispatch(client, {
    commandId: 'cmd-http-snapshots-project',
    defaultModelSelection: null,
    title: 'HTTP snapshots',
    type: 'project.create',
    workspaceRoot: rootPath,
  })
  await dispatch(client, {
    worktreeTarget: { kind: 'current', worktreeId: receipt.result!.worktreeId },
    commandId: 'cmd-http-snapshots-session',
    modelSelection: { model: 'mock-model', providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID },

    sessionId: SESSION_ID,
    title: 'HTTP snapshot session',
    type: 'session.create',
  })
}

async function dispatch(client: CommandClient, command: unknown) {
  const response = await client.orchestration.commands.post(command)
  expect(response.error).toBeNull()
  return v.parse(orchestrationDispatchResultSchema, response.data)
}

/** Settles with the rejection reason so the assertion can read its structure. */
function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error: unknown) => error,
  )
}
