import { expect, test } from 'vitest'
import { createWorktreeDomain, MANAGED_ID } from './factories/worktree-domain'

test('only the current provisioning operation may complete and first outcome wins', () => {
  const fixture = createWorktreeDomain()
  fixture.create()
  const firstOperation = fixture.worktree().operationId
  fixture.dispatch({
    type: 'worktree.create.fail',
    worktreeId: MANAGED_ID,
    operationId: firstOperation,
    errorCode: 'git.FAILED',
  })
  fixture.dispatch({ type: 'worktree.retry', worktreeId: MANAGED_ID })
  const secondOperation = fixture.worktree().operationId
  expect(secondOperation).not.toBe(firstOperation)
  expect(() =>
    fixture.dispatch({
      type: 'worktree.create.complete',
      worktreeId: MANAGED_ID,
      operationId: firstOperation,
      headCommit: 'a'.repeat(40),
    }),
  ).toThrow(expect.objectContaining({ code: 'worktree.STALE_RESULT' }))
  fixture.ready()
  expect(() =>
    fixture.dispatch({
      type: 'worktree.create.fail',
      worktreeId: MANAGED_ID,
      operationId: secondOperation,
      errorCode: 'late',
    }),
  ).toThrow(expect.objectContaining({ code: 'worktree.STALE_RESULT' }))
  expect(fixture.worktree().lifecycle.state).toBe('ready')
})

test('metadata CAS records A to B to A and rejects a stale observation', () => {
  const fixture = createWorktreeDomain()
  fixture.create()
  fixture.ready()
  const refresh = (expectedMetadataVersion: number, branch: string) =>
    fixture.dispatch({
      type: 'worktree.metadata.refresh',
      worktreeId: MANAGED_ID,
      expectedMetadataVersion,
      branch,
      headCommit: 'a'.repeat(40),
    })
  expect(refresh(0, fixture.worktree().branch!)).toHaveLength(0)
  refresh(0, 'branch-A')
  refresh(1, 'branch-B')
  refresh(2, 'branch-A')
  expect(fixture.worktree()).toMatchObject({ branch: 'branch-A', metadataVersion: 3 })
  expect(() => refresh(1, 'stale')).toThrow(
    expect.objectContaining({ code: 'worktree.STALE_RESULT' }),
  )
})
