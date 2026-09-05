import { onTestFinished } from 'vitest'
import { waitFor } from '@testing-library/react'
import { transportFor } from '@/features/chat/state/active-transports'
import { serverEndpoint } from '@/lib/client'
import { clientForQueryClient, queryClientFor } from '@/lib/environments/state/query-clients'
import { createFederationHarness } from '../../../test/factories/federation'
import { createTestMachineBridge } from '../../../test/factories/environment-connections'
import { expect, test } from '../../../test/fixtures'

test.for([37902, 37903])(
  'SSH shell failure recovers through port %i without a forward exit',
  async (recoveryPort, { server }) => {
    const h = await createFederationHarness(server)
    const previousBridge = window.platformBridge
    let crashed = false
    let connections = 0
    let origin = h.originB
    let localPort = 37902
    window.platformBridge = createTestMachineBridge(async (name) => {
      connections += 1
      if (crashed) {
        crashed = false
        await h.serverB.restart()
        localPort = recoveryPort
        origin = `http://localhost:${localPort}`
        h.restoreConnection(h.originB)
      }
      return { name, phase: 'live', origin, localPort, descriptor: h.descriptorB }
    })
    onTestFinished(() => {
      if (previousBridge) window.platformBridge = previousBridge
      if (!previousBridge) delete window.platformBridge
    })
    h.connections.configureMachines({
      remote: { kind: 'ssh', target: 'localhost', repoPath: '/work/platform' },
    })
    await waitFor(() => expect(h.connections.store.getState().machines[0]?.phase).toBe('live'))
    expect(connections).toBe(1)
    const primary = transportFor(h.descriptorA.environmentId)
    const remote = transportFor(h.descriptorB.environmentId)
    h.application.activateEnvironment(h.originB)
    const editor = h.application.getSnapshot().editor
    const queryClient = queryClientFor(h.originB)
    const client = clientForQueryClient(queryClient)
    crashed = true
    h.cutConnection(h.originB)
    await waitFor(() => expect(connections).toBeGreaterThan(1))
    await waitFor(() => expect(h.connections.store.getState().machines[0]?.endpoint).toBe(origin))
    await waitFor(() => expect(h.connections.store.getState().machines[0]?.phase).toBe('live'))
    expect(serverEndpoint(h.originB)).toBe(origin)
    expect(queryClientFor(h.originB)).toBe(queryClient)
    expect(clientForQueryClient(queryClient)).toBe(client)
    expect(h.application.getSnapshot().editor).toBe(editor)
    expect(remote?.closed).toBe(recoveryPort !== 37902)
    expect(transportFor(h.descriptorA.environmentId)).toBe(primary)
    expect(primary?.closed).toBe(false)
  },
)
