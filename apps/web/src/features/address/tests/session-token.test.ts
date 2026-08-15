import { describe } from 'vitest'

import { expect, test } from '../../../../test/fixtures'

import {
  parseSessionToken,
  sessionSelectionFor,
  sessionTokenFor,
} from '@/features/address/utils/session-token'
import type { ProjectId, ThreadId } from '@workspace/contracts'

const THREAD = 'thread-9f3a1c2e-77b0-4d51-9a2e-0c8f1b6d4a10' as ThreadId
const PROJECT = 'project-3f9c1a2b' as ProjectId

describe('sessionTokenFor', () => {
  test('encodes the three selection variants', () => {
    expect(sessionTokenFor({ kind: 'session', projectId: PROJECT, threadId: THREAD })).toBe(
      `t/${THREAD}`,
    )
    expect(sessionTokenFor({ kind: 'draft', projectId: PROJECT })).toBe('t/new')
    expect(sessionTokenFor({ kind: 'auto' })).toBeNull()
  })

  // ProjectId is a one-way hash of an absolute path and must never reach a URL.
  test('never leaks the project id', () => {
    expect(
      sessionTokenFor({ kind: 'session', projectId: PROJECT, threadId: THREAD }),
    ).not.toContain(PROJECT)
    expect(sessionTokenFor({ kind: 'draft', projectId: PROJECT })).not.toContain(PROJECT)
  })
})

describe('parseSessionToken', () => {
  test('round-trips a thread and a draft', () => {
    expect(parseSessionToken(`t/${THREAD}`)).toEqual({ kind: 'session', threadId: THREAD })
    expect(parseSessionToken('t/new')).toEqual({ kind: 'draft' })
  })

  test('is absent for an auto-pick and for a non-chat token', () => {
    expect(parseSessionToken(null)).toBeNull()
    expect(parseSessionToken('f/src/a.ts')).toBeNull()
  })

  /**
   * Shape only. The parser checks the `thread-` prefix and nothing else, because a
   * `ThreadId` is an opaque branded string — there is no format to validate against.
   * An abbreviated id therefore parses and then simply matches no thread, which is the
   * restore reporting `unavailable` rather than the parser guessing.
   */
  test('accepts any `thread-` shaped id without resolving it to a thread', () => {
    expect(parseSessionToken('t/thread-9f3a')).toEqual({ kind: 'session', threadId: 'thread-9f3a' })
  })

  test('rejects a malformed thread id rather than guessing', () => {
    expect(parseSessionToken('t/9f3a1c2e')).toEqual({ kind: 'rejected' })
    expect(parseSessionToken('t/')).toEqual({ kind: 'rejected' })
    expect(parseSessionToken('t/%E0%A4%A')).toEqual({ kind: 'rejected' })
  })
})

describe('sessionSelectionFor', () => {
  test('rebuilds the selection with a project id derived from the workspace', () => {
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
