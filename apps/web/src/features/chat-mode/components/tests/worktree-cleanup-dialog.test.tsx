import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorktreeCleanupDialog } from '@/features/chat-mode/components/worktree-cleanup-dialog'
import { TEST_WORKTREE_ID } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

test('force removal requires the separate discard confirmation', async () => {
  let confirmed = false
  renderWithProviders(
    <WorktreeCleanupDialog
      confirmation={{
        kind: 'force',
        preview: {
          worktreeId: TEST_WORKTREE_ID,
          authorization: { expectedHead: 'head', expectedStatusFingerprint: 'fingerprint' },
          changedFileCount: 3,
        },
      }}
      label='feature'
      pending={false}
      error={null}
      onCancel={() => {}}
      onConfirm={() => {
        confirmed = true
      }}
    />,
  )
  expect(confirmed).toBe(false)
  expect(screen.getByText(/tracked, untracked, and ignored/)).toBeInTheDocument()
  expect(screen.getByText(/3 changed files/)).toHaveClass('tabular-nums')
  await userEvent.click(screen.getByRole('button', { name: 'Discard changes and remove' }))
  expect(confirmed).toBe(true)
})
