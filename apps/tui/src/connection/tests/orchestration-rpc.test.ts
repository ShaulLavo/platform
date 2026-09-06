import { readEnvironmentDescriptor } from '@workspace/client-core/environments/descriptor'
import { commandIdSchema, ORCHESTRATION_WS_PROTOCOL_VERSION } from '@workspace/contracts'
import * as v from 'valibot'

import { createTestRpcClient } from '../../../test/factories/rpc-client'
import { test, expect } from '../../../test/fixtures'

test('authenticates, dispatches, and aborts a real shell subscription through the TUI host', async ({
  server,
  client,
}) => {
  const { rpc, environments } = createTestRpcClient({ server })
  const controller = new AbortController()
  try {
    const descriptor = await readEnvironmentDescriptor({
      origin: server.origin,
      client,
      environments,
      signal: controller.signal,
    })
    await rpc.ready()
    expect(environments.getState().entries[server.origin]?.environmentId).toBe(
      descriptor.environmentId,
    )
    expect(environments.getState().connectionByOrigin[server.origin]).toMatchObject({
      phase: 'connected',
      generation: 1,
      protocolVersion: ORCHESTRATION_WS_PROTOCOL_VERSION,
      serverInstanceId: expect.any(String),
    })
    const registration = await rpc.dispatchCommand({
      commandId: v.parse(commandIdSchema, 'tui-rpc-create-project'),
      defaultModelSelection: null,
      title: 'RPC fixture',
      type: 'project.create',
      workspaceRoot: server.root,
    })
    expect(registration.result).toMatchObject({
      projectId: expect.any(String),
      worktreeId: expect.any(String),
    })
    const stream = rpc.shellStream({ signal: controller.signal })[Symbol.asyncIterator]()
    expect(await stream.next()).toMatchObject({
      done: false,
      value: { kind: 'snapshot', snapshot: { projects: [{ title: 'RPC fixture' }] } },
    })
    const waiting = stream.next()
    controller.abort()
    expect(await waiting).toEqual({ done: true, value: undefined })
    await rpc.ready()
    expect(rpc.closed).toBe(false)
  } finally {
    controller.abort()
    rpc.close()
  }
})

test('reports real WebSocket origin rejection before a handshake can mark the connection live', async ({
  server,
}) => {
  const { rpc, environments } = createTestRpcClient({
    server,
    clientOrigin: 'https://untrusted.example',
  })
  try {
    await expect(rpc.ready()).rejects.toMatchObject({ code: 'ORCHESTRATION_WS_UNAUTHORIZED' })
    expect(environments.getState().connectionByOrigin[server.origin]).toMatchObject({
      phase: 'disconnected',
      generation: 0,
      serverInstanceId: null,
    })
  } finally {
    rpc.close()
  }
})

test('disposing the TUI RPC client releases a pending real subscription and rejects reuse', async ({
  server,
}) => {
  const { rpc } = createTestRpcClient({ server })
  try {
    const stream = rpc.shellStream()[Symbol.asyncIterator]()
    expect((await stream.next()).done).toBe(false)
    const waiting = stream.next()
    rpc.close()
    await expect(waiting).rejects.toMatchObject({ code: 'ORCHESTRATION_RPC_CLOSED' })
    await expect(rpc.ready()).rejects.toMatchObject({ code: 'ORCHESTRATION_RPC_CLOSED' })
  } finally {
    rpc.close()
  }
})
