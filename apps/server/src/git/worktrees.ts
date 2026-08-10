import path from 'node:path'

import { recordRequestContext } from '../observability'
import { relativeInsideRoot } from './path-utils'
import type { GitBranchDiffQuery, GitWorktreeCreateBody, GitWorktreeRemoveBody } from './contracts'
import type { GitRepositoryRunner, GitService } from './service'
import type {
  GitBaseRefChoicesResult,
  GitBranchDiffResult,
  GitWorktree,
  GitWorktreeCreateResult,
  GitWorktreeRemoveResult,
} from './types'
import { baseRefCandidates, baseRefChoiceId, buildBaseRefChoices } from './utils/base-refs'
import { gitWorktreeErrors } from './utils/worktree-errors'
import { parseWorktreeList, type ParsedWorktree } from './worktree-list'

/**
 * Session worktrees live inside the git common dir, not beside the checkout.
 * That keeps them inside the repository (so every path check has one boundary
 * to enforce), invisible to `git status` and to the workspace tree because git
 * never walks its own admin directory, and shared by every worktree of the
 * repository because `--git-common-dir` always points at the main one.
 */
const SESSION_WORKTREES_DIRECTORY = 'platform-worktrees'

/** Config key that remembers what a session branch forked from. */
const BASE_CONFIG_KEY = 'platform-base'

/**
 * Worktrees as the session layer needs them: one checkout per session, a
 * listing that says which session owns what, a removal that refuses to throw
 * away uncommitted work, and a diff of a session's whole branch against the
 * base it forked from.
 */
export class GitWorktreeService {
  private readonly git: GitService

  constructor(git: GitService) {
    this.git = git
  }

  async list(input = ''): Promise<GitWorktree[]> {
    recordWorktreeOperation('worktree_list', input)
    const runner = await this.git.repositoryRunner(input)
    const worktrees = await this.worktrees(runner)
    recordRequestContext({ git: { worktreeCount: worktrees.length } })

    return worktrees
  }

  async create(body: GitWorktreeCreateBody): Promise<GitWorktreeCreateResult> {
    recordWorktreeOperation('worktree_create', body.path, { sessionId: body.sessionId })
    const runner = await this.git.repositoryRunner(body.path)
    const absolutePath = await this.sessionWorktreePath(runner, body.sessionId)
    const existing = (await this.worktrees(runner)).find(
      (worktree) => worktree.absolutePath === absolutePath,
    )
    if (existing) return { created: false, worktree: existing }

    const branch = body.branch ?? `session/${body.sessionId}`
    await this.addWorktree(runner, { absolutePath, base: body.base, branch })
    const worktree = (await this.worktrees(runner)).find(
      (candidate) => candidate.absolutePath === absolutePath,
    )
    if (!worktree) throw gitWorktreeErrors.WORKTREE_NOT_FOUND({ path: absolutePath })

    recordRequestContext({ git: { branch, worktreePath: absolutePath } })

    return { created: true, worktree }
  }

  async remove(body: GitWorktreeRemoveBody): Promise<GitWorktreeRemoveResult> {
    recordWorktreeOperation('worktree_remove', body.path, { force: body.force })
    const runner = await this.git.repositoryRunner(body.path)
    const target = await this.removableWorktree(runner, body.worktreePath)
    const changedFileCount = await this.uncommittedFileCount(target)
    recordRequestContext({ git: { changedFileCount, worktreePath: target.absolutePath } })
    if (changedFileCount > 0 && !body.force) {
      throw gitWorktreeErrors.WORKTREE_DIRTY({
        fileCount: changedFileCount,
        path: target.path ?? target.absolutePath,
      })
    }

    const force = body.force ? ['--force'] : []
    await runner.run(['worktree', 'remove', ...force, target.absolutePath])

    return { removed: target, worktrees: await this.worktrees(runner) }
  }

  /**
   * Everything the branch carries on top of its base — the merge base to HEAD,
   * not base to HEAD, so commits the base gained afterwards do not show up as
   * the session's work. Uncommitted edits are deliberately absent: they belong
   * to the working tree, which `/git/diff` already reports for the same path.
   */
  async branchDiff(query: GitBranchDiffQuery): Promise<GitBranchDiffResult> {
    recordWorktreeOperation('branch_diff', query.path, { base: query.base })
    const runner = await this.git.repositoryRunner(query.path)
    const headBranch = await this.headBranch(runner)
    const baseRef = await this.requiredBaseRef(runner, headBranch, query.base)
    const mergeBase = await this.mergeBase(runner, baseRef)
    const files = await this.git.diffRefs({
      newRef: 'HEAD',
      oldRef: mergeBase ?? baseRef,
      path: runner.rootPath,
    })
    recordRequestContext({ git: { baseRef, diffCount: files.length, mergeBase } })

    return { baseRef, files, headRef: headBranch ?? 'HEAD', mergeBase }
  }

  async baseRefs(input = ''): Promise<GitBaseRefChoicesResult> {
    recordWorktreeOperation('base_refs', input)
    const runner = await this.git.repositoryRunner(input)
    const remoteNames = await this.remoteNames(runner)
    const [localBranches, remoteBranches] = await Promise.all([
      this.refNames(runner, 'refs/heads'),
      this.refNames(runner, 'refs/remotes'),
    ])
    const choices = buildBaseRefChoices(
      localBranches,
      // `<remote>/HEAD` is a symref onto another entry in the same list, so
      // offering it would put the default branch in the picker twice.
      remoteBranches.filter((branch) => !branch.endsWith('/HEAD')),
      remoteNames,
    )
    const defaultRef = await this.findBaseRef(runner, await this.headBranch(runner))
    recordRequestContext({ git: { branchCount: choices.length } })

    return { choices, defaultChoiceId: baseRefChoiceId(choices, defaultRef) }
  }

  private async worktrees(runner: GitRepositoryRunner): Promise<GitWorktree[]> {
    const result = await runner.run(['worktree', 'list', '--porcelain', '-z'])
    const sessionsRoot = await this.sessionWorktreesRoot(runner)

    return parseWorktreeList(result.stdout).map((parsed, index) =>
      toWorktree(parsed, {
        main: index === 0,
        sessionsRoot,
        workspacePath: runner.toWorkspacePath(parsed.absolutePath),
      }),
    )
  }

  private async addWorktree(
    runner: GitRepositoryRunner,
    input: { absolutePath: string; base?: string; branch: string },
  ) {
    const startPoint = input.base ?? 'HEAD'
    if (input.base) await this.assertRefExists(runner, input.base)

    // Re-attaching a session whose checkout was removed must not fail on the
    // branch it left behind, so an existing branch is checked out rather than
    // created a second time.
    const reuseBranch = await this.refExists(runner, `refs/heads/${input.branch}`)
    const args = reuseBranch
      ? ['worktree', 'add', input.absolutePath, input.branch]
      : ['worktree', 'add', '-b', input.branch, input.absolutePath, startPoint]
    await runner.run(args)
    if (reuseBranch) return

    await this.recordBase(runner, input.branch, input.base ?? (await this.headBranch(runner)))
  }

  /** Remembers the fork point so a later branch diff needs no explicit base. */
  private async recordBase(runner: GitRepositoryRunner, branch: string, base: string | null) {
    if (!base) return

    await runner.run(['config', `branch.${branch}.${BASE_CONFIG_KEY}`, base], {
      allowFailure: true,
    })
  }

  /**
   * Removal only ever targets a path git already reports as a worktree of this
   * repository. Matching against the listing is what makes it safe: an
   * unregistered path is refused before it can be resolved into something on
   * disk, so no `rm` can ever be aimed by the request alone. Either form the
   * listing reported is accepted — a session holds the absolute one.
   */
  private async removableWorktree(runner: GitRepositoryRunner, input: string) {
    const worktrees = await this.worktrees(runner)
    const byAbsolutePath = worktrees.find((worktree) => worktree.absolutePath === input)
    if (byAbsolutePath) return assertRemovable(runner, byAbsolutePath, input)

    const requested = runner.resolveWorkspacePath(input)
    const target = worktrees.find((worktree) => worktree.path === requested.relativePath)
    if (!target) throw gitWorktreeErrors.WORKTREE_NOT_FOUND({ path: requested.relativePath })

    return assertRemovable(runner, target, requested.relativePath)
  }

  /**
   * Read straight from git rather than through the cached `status` verb: the
   * cache exists to collapse polling, and a one-second-old answer is exactly
   * long enough to let a worktree that just became dirty be deleted anyway.
   */
  private async uncommittedFileCount(target: GitWorktree) {
    if (target.path === null) return 0

    const runner = await this.git.repositoryRunner(target.path)
    const result = await runner.run(['status', '--porcelain', '--untracked-files=all'])

    return result.stdout.split('\n').filter(Boolean).length
  }

  private async sessionWorktreePath(runner: GitRepositoryRunner, sessionId: string) {
    const root = await this.sessionWorktreesRoot(runner)
    const absolutePath = path.join(root, sessionId)
    // The session id is already shape-checked at the route, so this is the
    // second lock rather than the only one: nothing lands outside the repo.
    if (relativeInsideRoot(runner.rootAbsolutePath, absolutePath) === null) {
      throw gitWorktreeErrors.WORKTREE_OUTSIDE_REPOSITORY({ path: absolutePath })
    }

    return absolutePath
  }

  private async sessionWorktreesRoot(runner: GitRepositoryRunner) {
    const result = await runner.run(['rev-parse', '--git-common-dir'])
    const commonDir = result.stdout.trim()

    return path.join(
      path.isAbsolute(commonDir) ? commonDir : path.resolve(runner.rootAbsolutePath, commonDir),
      SESSION_WORKTREES_DIRECTORY,
    )
  }

  private async requiredBaseRef(
    runner: GitRepositoryRunner,
    headBranch: string | null,
    base?: string,
  ) {
    if (base) {
      await this.assertRefExists(runner, base)
      return base
    }

    const resolved = await this.findBaseRef(runner, headBranch)
    if (resolved) return resolved

    throw gitWorktreeErrors.WORKTREE_BASE_UNRESOLVED({ headBranch: headBranch ?? 'HEAD' })
  }

  /**
   * The recorded fork point first, then the remote's own default branch, then
   * the conventional names. Each candidate is tried on the remote before the
   * local branch: a base that exists in both places is the remote's, because
   * that is what the branch will eventually be merged into.
   */
  private async findBaseRef(runner: GitRepositoryRunner, headBranch: string | null) {
    const remoteNames = await this.remoteNames(runner)
    const primaryRemote = remoteNames[0] ?? null
    const candidates = baseRefCandidates({
      configuredBase: await this.configuredBase(runner, headBranch),
      defaultBranch: await this.remoteDefaultBranch(runner, primaryRemote),
      headBranch,
      remoteNames,
    })

    for (const candidate of candidates) {
      const remoteRef = primaryRemote ? `${primaryRemote}/${candidate}` : null
      if (remoteRef && (await this.refExists(runner, remoteRef))) return remoteRef
      if (await this.refExists(runner, candidate)) return candidate
    }

    return null
  }

  private async configuredBase(runner: GitRepositoryRunner, headBranch: string | null) {
    if (!headBranch) return null

    const result = await runner.run(
      ['config', '--get', `branch.${headBranch}.${BASE_CONFIG_KEY}`],
      { allowFailure: true },
    )

    return result.stdout.trim() || null
  }

  private async remoteDefaultBranch(runner: GitRepositoryRunner, remote: string | null) {
    if (!remote) return null

    const result = await runner.run(['rev-parse', '--abbrev-ref', `${remote}/HEAD`], {
      allowFailure: true,
    })
    if (result.exitCode !== 0) return null

    return result.stdout.trim() || null
  }

  /** `origin` first when it exists — the branch's eventual destination. */
  private async remoteNames(runner: GitRepositoryRunner) {
    const result = await runner.run(['remote'], { allowFailure: true })
    const names = result.stdout.split(/\r?\n/).filter(Boolean)

    return names.sort((left, right) => Number(right === 'origin') - Number(left === 'origin'))
  }

  private async refNames(runner: GitRepositoryRunner, namespace: string) {
    const result = await runner.run(['for-each-ref', '--format=%(refname:short)', namespace])

    return result.stdout.split(/\r?\n/).filter(Boolean)
  }

  private async headBranch(runner: GitRepositoryRunner) {
    const result = await runner.run(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true })
    const branch = result.stdout.trim()
    if (result.exitCode !== 0 || !branch || branch === 'HEAD') return null

    return branch
  }

  private async mergeBase(runner: GitRepositoryRunner, baseRef: string) {
    const result = await runner.run(['merge-base', baseRef, 'HEAD'], { allowFailure: true })
    if (result.exitCode !== 0) return null

    return result.stdout.trim() || null
  }

  private async assertRefExists(runner: GitRepositoryRunner, ref: string) {
    if (await this.refExists(runner, ref)) return

    throw gitWorktreeErrors.WORKTREE_BASE_NOT_FOUND({ base: ref })
  }

  private async refExists(runner: GitRepositoryRunner, ref: string) {
    // Peeling to a commit closes the same hole `diffRefs` closes: without it a
    // ref-shaped string can be accepted here and read as a pathspec later.
    const result = await runner.run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      allowFailure: true,
    })

    return result.exitCode === 0
  }
}

function assertRemovable(runner: GitRepositoryRunner, target: GitWorktree, requested: string) {
  if (target.main) throw gitWorktreeErrors.WORKTREE_MAIN_PROTECTED({ path: requested })
  // A worktree a human created beside the repository is still listed here, and
  // deleting it would reach outside the boundary this feature is confined to.
  if (relativeInsideRoot(runner.rootAbsolutePath, target.absolutePath) === null) {
    throw gitWorktreeErrors.WORKTREE_OUTSIDE_REPOSITORY({ path: requested })
  }

  return target
}

function toWorktree(
  parsed: ParsedWorktree,
  context: { main: boolean; sessionsRoot: string; workspacePath: string | null },
): GitWorktree {
  return {
    absolutePath: parsed.absolutePath,
    branch: parsed.branch,
    commit: parsed.commit,
    detached: parsed.detached,
    locked: parsed.locked,
    main: context.main,
    path: context.workspacePath,
    prunable: parsed.prunable,
    sessionId: sessionIdForPath(parsed.absolutePath, context.sessionsRoot),
  }
}

/** Only a direct child of the session root is a session worktree. */
function sessionIdForPath(absolutePath: string, sessionsRoot: string) {
  const relative = relativeInsideRoot(sessionsRoot, absolutePath)
  if (!relative) return null
  if (relative.includes('/')) return null

  return relative
}

function recordWorktreeOperation(
  operation: string,
  worktreePath = '',
  fields: Record<string, unknown> = {},
) {
  recordRequestContext({
    area: 'git',
    git: { operation, path: worktreePath, ...fields },
    operation,
  })
}
