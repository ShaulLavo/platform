import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  threadIdSchema,
  type OrchestrationSession,
  type OrchestrationSessionStatus,
} from '@workspace/contracts'
import * as v from 'valibot'

import { isBusyChatSession } from '@/features/chat/utils/thread-busy'

describe('chat thread status', () => {
  it('treats starting, running and waiting sessions as busy', () => {
    expect(isBusyChatSession(makeSession('starting'))).toBe(true)
    expect(isBusyChatSession(makeSession('running'))).toBe(true)
    expect(isBusyChatSession(makeSession('waiting'))).toBe(true)
    expect(isBusyChatSession(makeSession('ready'))).toBe(false)
    expect(isBusyChatSession(makeSession('interrupted'))).toBe(false)
    expect(isBusyChatSession(makeSession('stopped'))).toBe(false)
    expect(isBusyChatSession(makeSession('error'))).toBe(false)
  })
})

function makeSession(status: OrchestrationSessionStatus): OrchestrationSession {
  return {
    activeTurnId: null,
    lastError: status === 'error' ? 'failed' : null,
    providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    providerName: 'Codex',
    providerSessionId: null,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    status,
    threadId: v.parse(threadIdSchema, 'thread-1'),
    updatedAt: '2026-05-28T00:00:00.000Z',
  }
}
