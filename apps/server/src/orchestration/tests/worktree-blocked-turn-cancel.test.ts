import { expect, test } from 'vitest'
import { createWorktreeDomain, MANAGED_ID } from './factories/worktree-domain'
import { DOMAIN_IDS } from './factories/session-domain'

test('a failed checkout keeps its first turn and message, and retry releases that turn once', () => {
  const fixture = createWorktreeDomain()
  fixture.create(true)
  const session = () => fixture.snapshots.fullReadModel().sessions.get(DOMAIN_IDS.session)!
  expect(session().latestTurn?.providerStartState).toBe('blocked-on-worktree')
  expect(session().attentionState).toBe('working')
  fixture.dispatch({
    type: 'worktree.create.fail',
    worktreeId: MANAGED_ID,
    operationId: fixture.worktree().operationId,
    errorCode: 'git.FAILED',
  })
  expect(session()).toMatchObject({
    attentionState: 'needs-input',
    attentionReason: 'worktree',
    hasError: true,
  })
  fixture.dispatch({ type: 'worktree.retry', worktreeId: MANAGED_ID })
  fixture.ready()
  const release = {
    type: 'session.worktree.release',
    sessionId: DOMAIN_IDS.session,
    turnId: DOMAIN_IDS.turn,
    operationId: fixture.worktree().operationId,
  }
  fixture.dispatch(release)
  expect(session().latestTurn?.providerStartState).toBe('queued')
  expect(session().messages.map((message) => message.id)).toEqual(['original-message'])
  expect(() => fixture.dispatch(release)).toThrow()
})

test('interrupting a blocked turn terminalizes it even if provisioning completes later', () => {
  const fixture = createWorktreeDomain()
  fixture.create(true)
  fixture.dispatch({
    type: 'session.turn.interrupt',
    sessionId: DOMAIN_IDS.session,
    turnId: DOMAIN_IDS.turn,
  })
  fixture.ready()
  expect(() =>
    fixture.dispatch({
      type: 'session.worktree.release',
      sessionId: DOMAIN_IDS.session,
      turnId: DOMAIN_IDS.turn,
      operationId: fixture.worktree().operationId,
    }),
  ).toThrow()
  const session = fixture.snapshots.fullReadModel().sessions.get(DOMAIN_IDS.session)!
  expect(session.latestTurn).toMatchObject({
    state: 'interrupted',
    providerStartState: 'interrupted',
  })
  expect(session.messages).toHaveLength(1)
})

test('a checkout disappearing before provider claim blocks the queued turn without erasing its message', () => {
  const fixture = createWorktreeDomain()
  fixture.create()
  fixture.ready()
  fixture.dispatch({
    type: 'session.turn.start',
    sessionId: DOMAIN_IDS.session,
    turnId: DOMAIN_IDS.turn,
    message: { messageId: 'queued-message', role: 'user', text: 'Keep queued work' },
  })
  fixture.dispatch({ type: 'worktree.mark-missing', worktreeId: MANAGED_ID })
  const session = fixture.snapshots.fullReadModel().sessions.get(DOMAIN_IDS.session)!
  expect(session.latestTurn).toMatchObject({
    state: 'running',
    providerStartState: 'blocked-on-worktree',
  })
  expect(session.messages.map((message) => message.id)).toEqual(['queued-message'])
  expect(() =>
    fixture.dispatch({
      type: 'session.provider-start.claim',
      sessionId: session.id,
      turnId: DOMAIN_IDS.turn,
      observedSequence: session.latestTurn!.providerStartSequence,
      generation: 1,
      runtimeEpoch: 'must-not-start',
      createdAt: session.updatedAt,
    }),
  ).toThrow(expect.objectContaining({ code: 'worktree.NOT_READY' }))
})
