import { defineErrorCatalog } from 'evlog'

export const gitPullRequestErrors = defineErrorCatalog('git', {
  PUSH_DETACHED_HEAD: {
    status: 409,
    message: ({ path }: { path: string }) => `${path} has no checked-out branch to push`,
    why: 'HEAD is detached, so there is no branch name for the remote to publish under and no head for a pull request to point at.',
    fix: 'Check out or create a branch first, then push.',
  },
  PULL_REQUEST_CREATE_FAILED: {
    status: 502,
    message: ({ branch }: { branch: string }) =>
      `The GitHub CLI could not open a pull request for ${branch}`,
    why: 'gh refused the request: the branch may have no commits the base does not already have, may not be pushed yet, or the account may lack write access to the repository.',
    fix: 'Push the branch, confirm it is ahead of its base, and check that `gh auth status` reports an account with access to this repository.',
  },
})
