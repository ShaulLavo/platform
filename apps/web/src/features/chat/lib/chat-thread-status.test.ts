import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  type OrchestrationSession,
  type OrchestrationSessionStatus,
} from '@workspace/contracts'

import { isBusyChatSession } from './chat-thread-status'

describe('chat thread status', () => {
  it('treats only starting and running sessions as busy', () => {
    expect(isBusyChatSession(makeSession('starting'))).toBe(true)
    expect(isBusyChatSession(makeSession('running'))).toBe(true)
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
    threadId: 'thread-1',
    updatedAt: '2026-05-28T00:00:00.000Z',
  }
}
