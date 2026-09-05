import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { healthDescriptorSchema } from '../health'
import {
  ORCHESTRATION_WS_PROTOCOL_VERSION,
  orchestrationWsConnectedMessageSchema,
} from '../orchestration-ws'

const config = {
  environmentId: 'environment-a',
  protocolVersion: ORCHESTRATION_WS_PROTOCOL_VERSION,
  serverVersion: '0.0.1',
  serverInstanceId: 'process-a',
  startedAt: '2026-09-05T00:00:00.000Z',
  capabilities: { resume: true, synchronizedMarker: true },
  limits: { replayMaxEvents: 1_000, resumeMaxGap: 1_000 },
}

describe('environment identity contracts', () => {
  it('requires a nonempty environment identity in protocol 4 handshakes', () => {
    expect(ORCHESTRATION_WS_PROTOCOL_VERSION).toBe(4)
    expect(
      v.parse(orchestrationWsConnectedMessageSchema, { kind: 'connected', config }).config,
    ).toEqual(config)

    for (const environmentId of [undefined, '', '   ']) {
      expect(
        v.safeParse(orchestrationWsConnectedMessageSchema, {
          kind: 'connected',
          config: { ...config, environmentId },
        }).success,
      ).toBe(false)
    }
  })

  it('validates the descriptor and preserves filesystem information', () => {
    const descriptor = {
      ok: true,
      environmentId: config.environmentId,
      label: 'dev-machine',
      protocolVersion: config.protocolVersion,
      serverVersion: config.serverVersion,
      platform: { os: 'linux', arch: 'x64' },
      workspaceRoot: '/work/project',
    }

    expect(v.parse(healthDescriptorSchema, descriptor)).toEqual(descriptor)
    expect(v.safeParse(healthDescriptorSchema, { ...descriptor, environmentId: '' }).success).toBe(
      false,
    )
  })
})
