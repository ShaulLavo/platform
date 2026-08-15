import { describe, expect, it } from 'vitest'

import {
  parseSessionToken,
  sessionSelectionFor,
  sessionTokenFor,
} from '@/features/address/utils/session-token'
import type { ProjectId, ThreadId } from '@workspace/contracts'

const THREAD = 'thread-9f3a1c2e-77b0-4d51-9a2e-0c8f1b6d4a10' as ThreadId
const PROJECT = 'project-3f9c1a2b' as ProjectId

describe('sessionTokenFor', () => {
  it('encodes the three selection variants', () => {
    expect(sessionTokenFor({ kind: 'session', projectId: PROJECT, threadId: THREAD })).toBe(
      `t/${THREAD}`,
    )
    expect(sessionTokenFor({ kind: 'draft', projectId: PROJECT })).toBe('t/new')
    expect(sessionTokenFor({ kind: 'auto' })).toBeNull()
  })

  // ProjectId is a one-way hash of an absolute path and must never reach a URL.
  it('never leaks the project id', () => {
    expect(
      sessionTokenFor({ kind: 'session', projectId: PROJECT, threadId: THREAD }),
    ).not.toContain(PROJECT)
    expect(sessionTokenFor({ kind: 'draft', projectId: PROJECT })).not.toContain(PROJECT)
  })
})

describe('parseSessionToken', () => {
  it('round-trips a thread and a draft', () => {
    expect(parseSessionToken(`t/${THREAD}`)).toEqual({ kind: 'session', threadId: THREAD })
    expect(parseSessionToken('t/new')).toEqual({ kind: 'draft' })
  })

  it('is absent for an auto-pick and for a non-chat token', () => {
    expect(parseSessionToken(null)).toBeNull()
    expect(parseSessionToken('f/src/a.ts')).toBeNull()
  })

  // Thread ids are compared by exact equality everywhere, so a prefix cannot resolve.
  it('rejects an abbreviated or malformed thread id rather than guessing', () => {
    expect(parseSessionToken('t/thread-9f3a')).toEqual({ kind: 'session', threadId: 'thread-9f3a' })
    expect(parseSessionToken('t/9f3a1c2e')).toEqual({ kind: 'rejected' })
    expect(parseSessionToken('t/')).toEqual({ kind: 'rejected' })
    expect(parseSessionToken('t/%E0%A4%A')).toEqual({ kind: 'rejected' })
  })
})

describe('sessionSelectionFor', () => {
  it('rebuilds the selection with a project id derived from the workspace', () => {
    expect(sessionSelectionFor({ kind: 'session', threadId: THREAD }, PROJECT)).toEqual({
      kind: 'session',
      projectId: PROJECT,
      threadId: THREAD,
    })
    expect(sessionSelectionFor({ kind: 'draft' }, PROJECT)).toEqual({
      kind: 'draft',
      projectId: PROJECT,
    })
    expect(sessionSelectionFor({ kind: 'rejected' }, PROJECT)).toBeNull()
  })
})
