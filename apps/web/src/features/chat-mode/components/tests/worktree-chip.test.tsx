import { screen } from '@testing-library/react'
import { commandIdSchema } from '@workspace/contracts'
import * as v from 'valibot'
import { WorktreeChip } from '@/features/chat-mode/components/worktree-chip'
import { chatWorktree } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

test('labels a non-Git current checkout as Workspace and a detached Git checkout by stable ID', () => {
  const worktree = chatWorktree()
  const view = renderWithProviders(<WorktreeChip worktree={worktree} repositoryKind='directory' />)
  expect(screen.getByText('Workspace')).toBeInTheDocument()
  expect(screen.queryByText(/Detached/)).not.toBeInTheDocument()
  view.rerender(<WorktreeChip worktree={worktree} repositoryKind='git' />)
  expect(screen.getByText(`Detached · ${worktree.id.slice(0, 8)}`)).toBeInTheDocument()
})

test('the same worktree chip exposes shared identity, lifecycle and live counts', () => {
  const worktree = chatWorktree({
    branch: 'worktree/branch',
    ownership: 'platform',
    lifecycle: {
      state: 'cleanup-blocked',
      operationId: v.parse(commandIdSchema, 'cleanup'),
      reason: 'dirty',
      changedFileCount: 3,
    },
    cleanupEligibility: {
      reason: 'referenced',
      nonDeletedSessionCount: 2,
      canResolveMissing: false,
    },
  })
  const view = renderWithProviders(<WorktreeChip worktree={worktree} repositoryKind='git' />)
  expect(view.container.querySelector('[data-worktree-id]')).toHaveAttribute(
    'data-worktree-id',
    worktree.id,
  )
  expect(screen.getByText('2 sessions')).toHaveClass('tabular-nums')
  expect(screen.getByText('3 changed files')).toHaveClass('tabular-nums')
  expect(screen.getByText('Working changes retained')).toBeInTheDocument()
})

test('provisioning uses the shared loader and failure remains visible', () => {
  const operationId = v.parse(commandIdSchema, 'create')
  const view = renderWithProviders(
    <WorktreeChip
      repositoryKind='git'
      worktree={chatWorktree({
        lifecycle: { state: 'provisioning', operationId, baseCommit: 'abc', branch: 'feature' },
      })}
    />,
  )
  expect(screen.getByRole('status', { name: 'Creating worktree' })).toBeInTheDocument()
  view.rerender(
    <WorktreeChip
      repositoryKind='git'
      worktree={chatWorktree({
        lifecycle: { state: 'creation-failed', operationId, errorCode: 'GIT_FAILED' },
      })}
    />,
  )
  expect(screen.getByText('Creation failed')).toBeInTheDocument()
})
