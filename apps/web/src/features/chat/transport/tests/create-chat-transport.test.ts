import {
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  commandIdSchema,
  projectIdSchema,
  threadIdSchema,
} from '@workspace/contracts'
import * as v from 'valibot'
import { deferredSnapshotClient } from '../../../../../test/factories/deferred-snapshot-client'
import { createChatTransport } from '@/features/chat/transport/create-chat-transport'
import { activeServerOrigin, getClient, setActiveServerOrigin, setClient } from '@/lib/client'
import { expect, test } from '../../../../../test/fixtures'
import { makeTestServer } from '../../../../../test/server'
import { createInProcessClient } from '../../../../../test/client'
import { inProcessOrchestrationSocketFactory } from '../../../../../test/factories/in-process-orchestration-socket'

const PROJECT_ID = v.parse(projectIdSchema, 'transport-project')
const THREAD_ID = v.parse(threadIdSchema, 'transport-thread')

test('two transports dispatch and read snapshots from their owning servers after an active switch', async () => {
  const serverA = await makeTestServer({ filesystemWatch: false })
  const serverB = await makeTestServer({ filesystemWatch: false })
  const previousOrigin = activeServerOrigin()
  const previousClient = getClient()
  const originA = 'http://localhost:39001'
  const originB = 'http://localhost:39002'
  setActiveServerOrigin(originA)
  setClient(createInProcessClient(serverA))
  setActiveServerOrigin(originB)
  setClient(createInProcessClient(serverB))
  const transportA = createChatTransport(originA, {
    createSocket: inProcessOrchestrationSocketFactory(serverA),
  })
  const transportB = createChatTransport(originB, {
    createSocket: inProcessOrchestrationSocketFactory(serverB),
  })

  try {
    for (const [transport, title] of [
      [transportA, 'A'],
      [transportB, 'B'],
    ] as const) {
      await transport.dispatchCommand({
        commandId: v.parse(commandIdSchema, `project-${title}`),
        projectId: PROJECT_ID,
        defaultModelSelection: null,
        title,
        type: 'project.create',
        workspaceRoot: `/workspace/${title}`,
      })
      await transport.dispatchCommand({
        commandId: v.parse(commandIdSchema, `thread-${title}`),
        projectId: PROJECT_ID,
        threadId: THREAD_ID,
        title,
        type: 'thread.create',
        modelSelection: { model: 'mock-model', providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID },
        interactionMode: DEFAULT_INTERACTION_MODE,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        branch: null,
        worktreePath: null,
      })
    }
    expect(activeServerOrigin()).toBe(originB)
    expect((await transportA.threadDetailSnapshot(THREAD_ID)).thread.title).toBe('A')
    expect((await transportB.threadDetailSnapshot(THREAD_ID)).thread.title).toBe('B')
    const deferred = deferredSnapshotClient(serverA)
    setActiveServerOrigin(originA)
    setClient(deferred.client)
    const closingTransport = createChatTransport(originA)
    const snapshot = closingTransport.threadDetailSnapshot(THREAD_ID)
    await deferred.started
    closingTransport.close()
    deferred.release()
    await expect(snapshot).rejects.toMatchObject({ code: 'ORCHESTRATION_RPC_CLOSED' })
    setActiveServerOrigin(originB)
    const iterator = transportA.shellStream()[Symbol.asyncIterator]()
    expect((await iterator.next()).done).toBe(false)
    transportA.close()
    await expect(iterator.next()).rejects.toMatchObject({ code: 'ORCHESTRATION_RPC_CLOSED' })
    await expect(transportA.threadDetailSnapshot(THREAD_ID)).rejects.toMatchObject({
      code: 'ORCHESTRATION_RPC_CLOSED',
    })
    expect(() => transportA.retainThreadDetail(THREAD_ID)).toThrow('The chat transport is closed.')
  } finally {
    transportA.close()
    transportB.close()
    setActiveServerOrigin(previousOrigin)
    setClient(previousClient)
    await Promise.all([serverA.cleanup(), serverB.cleanup()])
  }
})
