import { describe, expect, it } from 'vitest'

import { chatMessage, providerSnapshot, thread, turnDiffSummary } from '../factories/chat'

describe('chat factories', () => {
  it('build valid defaults and apply overrides', () => {
    expect(chatMessage().role).toBe('assistant')
    expect(chatMessage({ text: 'override' }).text).toBe('override')

    expect(thread().pendingApprovalCount).toBe(0)
    expect(thread({ pendingApprovalCount: 3 }).pendingApprovalCount).toBe(3)

    expect(providerSnapshot().status).toBe('ready')
    expect(providerSnapshot({ status: 'error' }).status).toBe('error')

    expect(turnDiffSummary().files).toHaveLength(2)
  })
})
