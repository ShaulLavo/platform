import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GitStoreProvider } from '@/features/git/providers/git-store-provider'
import { useGitState } from '@/features/git/state'
import { expect, test } from '../../../../test/fixtures'
import { renderWithProviders } from '../../../../test/render'

function CommitMessageProbe() {
  const commitMessage = useGitState((state) => state.commitMessage)
  const setCommitMessage = useGitState((state) => state.setCommitMessage)

  return (
    <>
      <span data-testid='message'>{commitMessage}</span>
      <button onClick={() => setCommitMessage('fix: only meant for project A')} type='button'>
        write
      </button>
    </>
  )
}

function renderAtRoot(rootPath: string) {
  return renderWithProviders(
    <GitStoreProvider rootPath={rootPath}>
      <CommitMessageProbe />
    </GitStoreProvider>,
  )
}

test('a commit message never follows the user into another project', async () => {
  const view = renderAtRoot('/repo/a')
  await userEvent.click(screen.getByRole('button', { name: 'write' }))
  expect(screen.getByTestId('message')).toHaveTextContent('fix: only meant for project A')

  view.rerender(
    <GitStoreProvider rootPath='/repo/b'>
      <CommitMessageProbe />
    </GitStoreProvider>,
  )

  // The commit mutation takes the ACTIVE rootPath, so a message that survived the
  // switch would be committed to the wrong repository.
  expect(screen.getByTestId('message')).toHaveTextContent('')
})

test('switching back returns the message you were part-way through writing', async () => {
  const view = renderAtRoot('/repo/a')
  await userEvent.click(screen.getByRole('button', { name: 'write' }))

  view.rerender(
    <GitStoreProvider rootPath='/repo/b'>
      <CommitMessageProbe />
    </GitStoreProvider>,
  )
  view.rerender(
    <GitStoreProvider rootPath='/repo/a'>
      <CommitMessageProbe />
    </GitStoreProvider>,
  )

  expect(screen.getByTestId('message')).toHaveTextContent('fix: only meant for project A')
})
