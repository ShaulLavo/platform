import { TEST_ENVIRONMENT_ID } from './chat'
import {
  ORCHESTRATION_WS_PROTOCOL_VERSION,
  type OrchestrationWsServerConfig,
} from '@workspace/contracts'

export function orchestrationServerConfig(overrides: Partial<OrchestrationWsServerConfig> = {}) {
  return {
    capabilities: { resume: true, synchronizedMarker: true },
    environmentId: TEST_ENVIRONMENT_ID,
    limits: { replayMaxEvents: 1_000, resumeMaxGap: 1_000 },
    protocolVersion: ORCHESTRATION_WS_PROTOCOL_VERSION,
    serverInstanceId: 'server-1',
    serverVersion: '0.0.1',
    startedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  } satisfies OrchestrationWsServerConfig
}
