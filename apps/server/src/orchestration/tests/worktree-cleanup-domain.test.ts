import { expect, test } from 'vitest'
import { createWorktreeDomain, MANAGED_ID } from './factories/worktree-domain'
import { DOMAIN_IDS } from './factories/session-domain'

test('cleanup rejects live references and failed stops, while blob failure does not block removal', () => {
  const fixture = createWorktreeDomain()
  fixture.create()
  fixture.ready()
  const cleanup = () => fixture.dispatch({ type: 'worktree.cleanup', worktreeId: MANAGED_ID })
  expect(cleanup).toThrow(expect.objectContaining({ code: 'worktree.CLEANUP_INELIGIBLE' }))
  expect(fixture.worktree().lifecycle.state).toBe('ready')
  fixture.dispatch({ type: 'session.delete', sessionId: DOMAIN_IDS.session })
  const deletion = fixture.snapshots.fullReadModel().sessions.get(DOMAIN_IDS.session)!.deletion!
  fixture.dispatch({
    type: 'session.deletion.update',
    sessionId: DOMAIN_IDS.session,
    deletion: { ...deletion, providerStop: 'failed', blobCleanup: 'completed' },
  })
  expect(cleanup).toThrow()
  fixture.dispatch({
    type: 'session.deletion.update',
    sessionId: DOMAIN_IDS.session,
    deletion: { ...deletion, providerStop: 'no-binding', blobCleanup: 'failed' },
  })
  cleanup()
  const operationId = fixture.worktree().operationId
  expect(() =>
    fixture.dispatch({
      type: 'worktree.cleanup.complete',
      worktreeId: MANAGED_ID,
      operationId,
      mode: 'discard-changes',
    }),
  ).toThrow(expect.objectContaining({ code: 'worktree.STALE_RESULT' }))
  fixture.dispatch({
    type: 'worktree.cleanup.blocked',
    worktreeId: MANAGED_ID,
    operationId,
    mode: 'safe',
    reason: 'dirty',
    changedFileCount: 3,
  })
  expect(fixture.worktree().lifecycle).toMatchObject({
    state: 'cleanup-blocked',
    reason: 'dirty',
    changedFileCount: 3,
  })
  fixture.dispatch({ type: 'worktree.retain', worktreeId: MANAGED_ID, verified: true })
  expect(fixture.worktree().lifecycle.state).toBe('ready')
  cleanup()
  expect(() =>
    fixture.dispatch({
      type: 'worktree.cleanup.complete',
      worktreeId: MANAGED_ID,
      operationId,
      mode: 'safe',
    }),
  ).toThrow()
  fixture.dispatch({
    type: 'worktree.cleanup.complete',
    worktreeId: MANAGED_ID,
    operationId: fixture.worktree().operationId,
    mode: 'safe',
  })
  expect(() =>
    fixture.dispatch({
      type: 'worktree.cleanup.fail',
      worktreeId: MANAGED_ID,
      operationId: fixture.worktree().operationId,
      mode: 'safe',
      errorCode: 'late',
    }),
  ).toThrow(expect.objectContaining({ code: 'worktree.STALE_RESULT' }))
  expect(
    fixture.snapshots.shellSnapshot().worktrees.find((worktree) => worktree.id === MANAGED_ID)
      ?.lifecycle.state,
  ).toBe('removed')
})

test('terminal claims remain cleanup ownership until an acknowledged end and unknown epochs stay blocked', () => {
  const fixture = createWorktreeDomain()
  fixture.create()
  fixture.ready()
  fixture.dispatch({ type: 'session.delete', sessionId: DOMAIN_IDS.session })
  const deletion = fixture.snapshots.fullReadModel().sessions.get(DOMAIN_IDS.session)!.deletion!
  fixture.dispatch({
    type: 'session.deletion.update',
    sessionId: DOMAIN_IDS.session,
    deletion: { ...deletion, providerStop: 'no-binding', blobCleanup: 'completed' },
  })
  const lease = {
    worktreeId: MANAGED_ID,
    terminalLeaseId: '8cd29f12-b782-4946-9ee1-9c911ec71b59',
    runtimeEpoch: 'old-epoch',
  }
  fixture.dispatch({ ...lease, type: 'terminal.lease.request' })
  expect(fixture.worktree().activeTerminalCount).toBe(1)
  expect(() => fixture.dispatch({ type: 'worktree.cleanup', worktreeId: MANAGED_ID })).toThrow()
  fixture.dispatch({ ...lease, type: 'terminal.lease.claim' })
  fixture.dispatch({ ...lease, type: 'terminal.lease.activate' })
  fixture.dispatch({ ...lease, type: 'terminal.lease.terminate' })
  expect(fixture.worktree().activeTerminalCount).toBe(1)
  fixture.dispatch({ ...lease, type: 'terminal.lease.mark-unknown' })
  expect(fixture.worktree()).toMatchObject({
    activeTerminalCount: 0,
    terminalOwnershipUnknown: true,
    cleanupEligibility: { reason: 'terminal-ownership-unknown' },
  })
  expect(() => fixture.dispatch({ ...lease, type: 'terminal.lease.end' })).toThrow()
  expect(() =>
    fixture.dispatch({
      type: 'worktree.force-cleanup',
      worktreeId: MANAGED_ID,
      authorization: { expectedHead: 'head', expectedStatusFingerprint: 'fingerprint' },
    }),
  ).toThrow()
  fixture.dispatch({ type: 'worktree.release', worktreeId: MANAGED_ID })
  expect(fixture.worktree().ownership).toBe('external')
})
