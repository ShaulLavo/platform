import { describe, expect, it } from 'vitest'
import {
  CODEX_CLIENT_REQUEST_PARAMS,
  CODEX_CLIENT_REQUEST_RESULTS,
  CODEX_SERVER_NOTIFICATION_PARAMS,
  V2AgentMessageDeltaNotificationSchema,
  V2ThreadStartParamsSchema,
  V2TurnStartResponseSchema,
} from '../index'
import { renderValibotExpressionForTest } from '../generate'

describe('Codex protocol generator', () => {
  it('maps representative JSON schema features to Valibot source', () => {
    const source = renderValibotExpressionForTest({
      properties: {
        flags: {
          additionalProperties: { type: 'boolean' },
          type: 'object',
        },
        id: { type: 'string' },
        mode: { enum: ['fast', 'safe'], type: 'string' },
        score: { minimum: 0, type: 'integer' },
        tags: { items: { type: 'string' }, type: 'array' },
      },
      required: ['id', 'mode'],
      type: 'object',
    })

    expect(source).toContain('v.looseObject')
    expect(source).toContain('"id": v.string()')
    expect(source).toContain('"mode": v.picklist(["fast","safe"])')
    expect(source).toContain('"score": v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)))')
    expect(source).toContain('"flags": v.optional(v.record(v.string(), v.boolean()))')
  })

  it('generates method maps for Platform-used Codex protocol methods', () => {
    expect(CODEX_CLIENT_REQUEST_PARAMS['thread/start']).toBe(V2ThreadStartParamsSchema)
    expect(CODEX_CLIENT_REQUEST_RESULTS['turn/start']).toBe(V2TurnStartResponseSchema)
    expect(CODEX_SERVER_NOTIFICATION_PARAMS['item/agentMessage/delta']).toBe(
      V2AgentMessageDeltaNotificationSchema,
    )
  })
})
