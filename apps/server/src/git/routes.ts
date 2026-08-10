import { Elysia } from 'elysia'
import {
  gitApplyPatchBodySchema,
  gitBlobDiffQuerySchema,
  gitBranchDiffQuerySchema,
  gitCheckoutBodySchema,
  gitCommitBodySchema,
  gitCreateBranchBodySchema,
  gitDiffQuerySchema,
  gitFileQuerySchema,
  gitPathBodySchema,
  gitPathQuerySchema,
  gitPathsBodySchema,
  gitWorktreeCreateBodySchema,
  gitWorktreeRemoveBodySchema,
} from './contracts'
import type { GitService } from './service'
import { GitWorktreeService } from './worktrees'

export function gitRoutes(git: GitService) {
  const worktrees = new GitWorktreeService(git)

  return new Elysia({ name: 'git-routes' }).group('/git', (app) =>
    app
      .get('/repo', ({ query }) => git.repo(query.path), {
        query: gitPathQuerySchema,
      })
      .get('/status', ({ query }) => git.status(query.path), {
        query: gitPathQuerySchema,
      })
      .get('/diff/blob', ({ query }) => git.diffBlob(query), {
        query: gitBlobDiffQuerySchema,
      })
      .get('/diff', ({ query }) => git.diff(query.path, query.staged), {
        query: gitDiffQuerySchema,
      })
      .get('/file', ({ query }) => git.file(query.path, query.ref), {
        query: gitFileQuerySchema,
      })
      .get('/branches', ({ query }) => git.branches(query.path), {
        query: gitPathQuerySchema,
      })
      .get('/base-refs', ({ query }) => worktrees.baseRefs(query.path), {
        query: gitPathQuerySchema,
      })
      .get('/branch-diff', ({ query }) => worktrees.branchDiff(query), {
        query: gitBranchDiffQuerySchema,
      })
      .get('/worktrees', ({ query }) => worktrees.list(query.path), {
        query: gitPathQuerySchema,
      })
      .post('/worktrees/create', ({ body }) => worktrees.create(body), {
        body: gitWorktreeCreateBodySchema,
      })
      .post('/worktrees/remove', ({ body }) => worktrees.remove(body), {
        body: gitWorktreeRemoveBodySchema,
      })
      .post('/stage', ({ body }) => git.stage(body), {
        body: gitPathsBodySchema,
      })
      .post('/unstage', ({ body }) => git.unstage(body), {
        body: gitPathsBodySchema,
      })
      .post('/discard', ({ body }) => git.discard(body), {
        body: gitPathsBodySchema,
      })
      .post('/apply-patch', ({ body }) => git.applyPatch(body), {
        body: gitApplyPatchBodySchema,
      })
      .post('/commit', ({ body }) => git.commit(body), {
        body: gitCommitBodySchema,
      })
      .post('/checkout', ({ body }) => git.checkout(body), {
        body: gitCheckoutBodySchema,
      })
      .post('/create-branch', ({ body }) => git.createBranch(body), {
        body: gitCreateBranchBodySchema,
      })
      .post('/fetch', ({ body }) => git.fetch(body.path), {
        body: gitPathBodySchema,
      })
      .post('/pull', ({ body }) => git.pull(body.path), {
        body: gitPathBodySchema,
      })
      .post('/push', ({ body }) => git.push(body.path), {
        body: gitPathBodySchema,
      }),
  )
}
