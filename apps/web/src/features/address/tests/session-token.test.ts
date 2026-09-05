import { describe } from 'vitest'

import { expect, test } from '../../../../test/fixtures'

import {
  parseSessionToken,
  sessionSelectionFor,
  sessionTokenFor,
} from '@/features/address/utils/session-token'
import type { EnvironmentId, ProjectId, SessionId } from '@workspace/contracts'

const ENVIRONMENT = '499c1da4-fd11-4701-a7d1-0d19381e8fd5' as EnvironmentId
const SESSION = '5f7f875d-6e41-5275-8927-06a9e5a4a2e1' as SessionId
const PROJECT = '55c44f54-ec6c-528c-9f47-e6d153540158' as ProjectId

describe('sessionTokenFor', () => {
  test('encodes the three selection variants', () => {
    expect(
      sessionTokenFor({
        kind: 'session',
        environmentId: ENVIRONMENT,
        projectId: PROJECT,
        sessionId: SESSION,
      }),
    ).toBe(`t/${SESSION}`)
    expect(sessionTokenFor({ kind: 'draft', environmentId: ENVIRONMENT, projectId: PROJECT })).toBe(
      't/new',
    )
    expect(sessionTokenFor({ kind: 'auto' })).toBeNull()
  })

  // The session UUID resolves its project through the addressed environment.
  test('never leaks the project id', () => {
    expect(
      sessionTokenFor({
        kind: 'session',
        environmentId: ENVIRONMENT,
        projectId: PROJECT,
        sessionId: SESSION,
      }),
    ).not.toContain(PROJECT)
    expect(
      sessionTokenFor({ kind: 'draft', environmentId: ENVIRONMENT, projectId: PROJECT }),
    ).not.toContain(PROJECT)
  })
})

describe('parseSessionToken', () => {
  test('round-trips a session and a draft', () => {
    expect(parseSessionToken(`t/${SESSION}`)).toEqual({ kind: 'session', sessionId: SESSION })
    expect(parseSessionToken('t/new')).toEqual({ kind: 'draft' })
  })

  test('is absent for an auto-pick and for a non-chat token', () => {
    expect(parseSessionToken(null)).toBeNull()
    expect(parseSessionToken('f/src/a.ts')).toBeNull()
  })

  test('rejects prefixed and abbreviated identifiers', () => {
    expect(parseSessionToken('t/session-9f3a')).toEqual({ kind: 'rejected' })
    expect(parseSessionToken(`t/session-${SESSION}`)).toEqual({ kind: 'rejected' })
  })

  test('rejects a malformed session id rather than guessing', () => {
    expect(parseSessionToken('t/9f3a1c2e')).toEqual({ kind: 'rejected' })
    expect(parseSessionToken('t/')).toEqual({ kind: 'rejected' })
    expect(parseSessionToken('t/%E0%A4%A')).toEqual({ kind: 'rejected' })
  })
})

describe('sessionSelectionFor', () => {
  test('rebuilds the selection with a confirmed environment and project', () => {
    expect(
      sessionSelectionFor({ kind: 'session', sessionId: SESSION }, ENVIRONMENT, PROJECT),
    ).toEqual({
      kind: 'session',
      environmentId: ENVIRONMENT,
      projectId: PROJECT,
      sessionId: SESSION,
    })
    expect(sessionSelectionFor({ kind: 'draft' }, ENVIRONMENT, PROJECT)).toEqual({
      kind: 'draft',
      environmentId: ENVIRONMENT,
      projectId: PROJECT,
    })
    expect(sessionSelectionFor({ kind: 'rejected' }, ENVIRONMENT, PROJECT)).toBeNull()
  })
})
