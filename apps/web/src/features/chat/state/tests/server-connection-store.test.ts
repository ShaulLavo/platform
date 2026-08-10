import {
  ORCHESTRATION_WS_PROTOCOL_VERSION,
  type OrchestrationWsServerConfig,
} from '@workspace/contracts'
import { beforeEach } from 'vitest'

import {
  resetServerConnectionStore,
  selectServerProtocolSkew,
  useServerConnectionStore,
} from '@/features/chat/state/server-connection-store'
import { expect, test } from '../../../../../test/fixtures'

beforeEach(resetServerConnectionStore)

function serverConfig(overrides: Partial<OrchestrationWsServerConfig> = {}) {
  return {
    capabilities: { resume: true, synchronizedMarker: true },
    limits: { replayMaxEvents: 1_000, resumeMaxGap: 1_000 },
    protocolVersion: ORCHESTRATION_WS_PROTOCOL_VERSION,
    serverInstanceId: 'server-1',
    serverVersion: '0.0.1',
    startedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  } satisfies OrchestrationWsServerConfig
}

test('the first handshake starts the first generation', () => {
  useServerConnectionStore.getState().reportConnected(serverConfig())

  expect(useServerConnectionStore.getState().generation).toBe(1)
  expect(useServerConnectionStore.getState().serverInstanceId).toBe('server-1')
})

test('reconnecting to the same process is not a new generation', () => {
  const store = useServerConnectionStore.getState()
  store.reportConnected(serverConfig())
  store.reportConnected(serverConfig())
  store.reportConnected(serverConfig())

  // Otherwise every dropped socket on a flaky network refetches the world.
  expect(useServerConnectionStore.getState().generation).toBe(1)
})

test('a restarted server is a new generation, which is what invalidates caches', () => {
  const store = useServerConnectionStore.getState()
  store.reportConnected(serverConfig())
  store.reportConnected(serverConfig({ serverInstanceId: 'server-2' }))

  expect(useServerConnectionStore.getState().generation).toBe(2)
  expect(useServerConnectionStore.getState().serverInstanceId).toBe('server-2')
})

test('a server speaking another protocol is detectable on connect', () => {
  expect(
    selectServerProtocolSkew({ protocolVersion: null }, ORCHESTRATION_WS_PROTOCOL_VERSION),
  ).toBe(false)
  useServerConnectionStore.getState().reportConnected(serverConfig())
  expect(
    selectServerProtocolSkew(
      useServerConnectionStore.getState(),
      ORCHESTRATION_WS_PROTOCOL_VERSION,
    ),
  ).toBe(false)

  useServerConnectionStore
    .getState()
    .reportConnected(serverConfig({ protocolVersion: ORCHESTRATION_WS_PROTOCOL_VERSION + 1 }))

  expect(
    selectServerProtocolSkew(
      useServerConnectionStore.getState(),
      ORCHESTRATION_WS_PROTOCOL_VERSION,
    ),
  ).toBe(true)
})

test('overdue requests are counted by identity, not by arithmetic', () => {
  const store = useServerConnectionStore.getState()
  store.markSlowRequest('request-1')
  store.markSlowRequest('request-1')
  store.markSlowRequest('request-2')

  expect(useServerConnectionStore.getState().slowRequestCount).toBe(2)

  store.clearSlowRequest('request-1')
  // A request that was never overdue settling must not drive the count negative.
  store.clearSlowRequest('request-never-slow')

  expect(useServerConnectionStore.getState().slowRequestCount).toBe(1)
})
