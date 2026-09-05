import {
  environmentIdSchema,
  ORCHESTRATION_WS_PROTOCOL_VERSION,
  type OrchestrationWsServerConfig,
} from '@workspace/contracts'
import * as v from 'valibot'

const TEST_ENVIRONMENT_ID = v.parse(environmentIdSchema, 'd47787b9-67dc-460c-8aa2-d4ed932b1568')

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
