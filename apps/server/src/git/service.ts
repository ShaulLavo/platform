import { stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FsError } from '../fs/errors'
import type { WorkspacePaths } from '../fs/path'
import { toPosix } from '../fs/path'
import { elapsedMs, limitText, recordGitCommand, recordRequestContext } from '../observability'
import { parseBranches } from './branches'
import { commandOutput, gitErrorMessage, writeProcessInput } from './command'
import { commitMessageTemplate } from './commit-message'
import type {
  GitApplyPatchBody,
  GitBlobDiffQuery,
  GitCheckoutBody,
  GitCommitBody,
  GitCreateBranchBody,
  GitPathsBody,
} from './contracts'
import { parseDiff, rewriteBlobPatchPaths } from './diff'
import { mutationPaths, pathspecArgs, repositoryRelativePath } from './path-utils'
import { gitCwdForPath, lexicalRepositoryRoot } from './repository'
import { parseRepositoryInfo, parseStatus, statusMatchesPathspec } from './status'
import { UpstreamFetchScheduler } from './upstream-fetch'
import type {
  GitBranchesResult,
  GitCommandResult,
  GitCommitResult,
  GitFileDiff,
  GitRepository,
  GitRepositoryInfo,
  GitStatusResult,
} from './types'

export type {
  GitBranch,
  GitBranchesResult,
  GitCommitResult,
  GitDiffHunk,
  GitFileDiff,
  GitFileStatus,
  GitLineChange,
  GitRepositoryInfo,
  GitStatusResult,
  GitTreeStatus,
} from './types'

type GitRepositoryLocation = Omit<GitRepository, 'info'>

type GitServiceOptions = {
  diffConcurrency?: number
  maxTextFileBytes?: number
}

const DEFAULT_DIFF_CONCURRENCY = 4
const DEFAULT_MAX_TEXT_FILE_BYTES = 209_715_200

export class GitService {
  private readonly paths: WorkspacePaths
  private readonly diffConcurrency: number
  private readonly maxTextFileBytes: number
  private readonly upstreamFetch: UpstreamFetchScheduler

  constructor(paths: WorkspacePaths, options: GitServiceOptions = {}) {
    this.paths = paths
    this.diffConcurrency = positiveInteger(options.diffConcurrency, DEFAULT_DIFF_CONCURRENCY)
    this.maxTextFileBytes = positiveInteger(options.maxTextFileBytes, DEFAULT_MAX_TEXT_FILE_BYTES)
    this.upstreamFetch = new UpstreamFetchScheduler({
      resolveCommonDir: async (rootAbsolutePath) => {
        const result = await this.git(rootAbsolutePath, ['rev-parse', '--git-common-dir'])
        return path.resolve(rootAbsolutePath, result.stdout.trim())
      },
      runFetch: async (rootAbsolutePath, remote) => {
        await this.git(rootAbsolutePath, ['fetch', remote])
      },
    })
  }

  async repo(input = '') {
    recordGitServiceOperation('repo', input)
    const repository = await this.resolveRepository(input)
    return { repository: repository?.info ?? null }
  }

  async status(input = ''): Promise<GitStatusResult> {
    recordGitServiceOperation('status', input)
    const repository = await this.resolveRepositoryLocation(input)
    if (!repository) return { repository: null, files: [] }

    const args = [
      'status',
      '--porcelain=v2',
      '--branch',
      '-z',
      '--untracked-files=all',
      ...pathspecArgs(repository.pathspec),
    ]
    const result = await this.git(repository.rootAbsolutePath, args)
    void this.upstreamFetch.schedule(repository.rootAbsolutePath, result.stdout)
    const status = {
      repository: parseRepositoryInfo(result.stdout, repository.rootPath),
      files: parseStatus(result.stdout, repository.rootPath),
    }
    recordRequestContext({ git: { fileCount: status.files.length } })
    return status
  }

  async diff(input = '', staged = false): Promise<GitFileDiff[]> {
    recordGitServiceOperation('diff', input, { staged })
    const repository = await this.resolveRepositoryLocation(input)
    if (!repository) return []

    const pathspecs = await this.diffPathspecArgs(repository, staged)
    const args = [
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      '--find-renames',
      '--unified=3',
      ...(staged ? ['--cached'] : []),
      ...pathspecs,
    ]
    const result = await this.git(repository.rootAbsolutePath, args)
    const diffs =
      result.stdout || staged
        ? parseDiff(result.stdout, repository.rootPath, staged)
        : await this.untrackedDiffs(repository)
    const results = await mapWithConcurrency(diffs, this.diffConcurrency, async (diff) =>
      this.withDiffSnapshotRefs(repository, diff),
    )
    recordRequestContext({ git: { diffCount: results.length } })
    return results
  }

  async diffBlob(query: GitBlobDiffQuery): Promise<GitFileDiff[]> {
    recordGitServiceOperation('diff_blob', query.path || query.oldPath || '')
    const repository = await this.requiredRepositoryLocation(query.path || query.oldPath || '')
    const oldPath = query.oldPath ?? query.path
    const rawPatch = await this.blobPatch(repository, query)
    const patch = rewriteBlobPatchPaths(rawPatch, {
      newObjectId: query.newObjectId,
      oldObjectId: query.oldObjectId,
      oldPath,
      path: query.path,
    })
    const diffs = parseDiff(patch, repository.rootPath, false)

    const results = await mapWithConcurrency(diffs, this.diffConcurrency, async (diff) =>
      this.withBlobDiffContent(repository, diff, query),
    )
    recordRequestContext({ git: { diffCount: results.length } })
    return results
  }

  async diffRefs(input: { path: string; oldRef: string; newRef: string }): Promise<GitFileDiff[]> {
    recordGitServiceOperation('diff_refs', input.path)
    const repository = await this.requiredRepositoryLocation(input.path)
    const result = await this.git(repository.rootAbsolutePath, [
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      '--find-renames',
      '--unified=3',
      input.oldRef,
      input.newRef,
    ])
    const diffs = parseDiff(result.stdout, repository.rootPath, false)
    const results = await mapWithConcurrency(diffs, this.diffConcurrency, async (diff) =>
      this.withRefDiffSnapshotRefs(repository, diff, input),
    )

    recordRequestContext({ git: { diffCount: results.length } })
    return results
  }

  async hasRef(input: { path: string; ref: string }) {
    recordGitServiceOperation('has_ref', input.path, { ref: input.ref })
    const repository = await this.requiredRepositoryLocation(input.path)

    return (await this.resolveRefCommit(repository, input.ref)) !== null
  }

  async restoreRef(input: { fallbackToHead?: boolean; path: string; ref: string }) {
    recordGitServiceOperation('restore_ref', input.path, {
      fallbackToHead: input.fallbackToHead,
      ref: input.ref,
    })
    const repository = await this.requiredRepositoryLocation(input.path)
    const commit =
      (await this.resolveRefCommit(repository, input.ref)) ??
      (input.fallbackToHead ? await this.resolveRefCommit(repository, 'HEAD') : null)
    if (!commit) return false

    await this.git(repository.rootAbsolutePath, [
      'restore',
      '--source',
      commit,
      '--worktree',
      '--staged',
      '--',
      '.',
    ])
    await this.git(repository.rootAbsolutePath, ['clean', '-fd', '--', '.'])

    return true
  }

  async deleteRefs(input: { path: string; refs: readonly string[] }) {
    const refs = Array.from(new Set(input.refs)).filter(Boolean)
    recordGitServiceOperation('delete_refs', input.path, { refCount: refs.length })
    if (refs.length === 0) return

    const repository = await this.requiredRepositoryLocation(input.path)
    for (const ref of refs) {
      await this.git(repository.rootAbsolutePath, ['update-ref', '-d', ref], {
        allowFailure: true,
      })
    }
  }

  async file(input: string, ref: string) {
    recordGitServiceOperation('file', input)
    const repository = await this.resolveRepositoryLocation(input)
    if (!repository?.pathspec) throw new FsError('GIT_REPOSITORY_NOT_FOUND')

    const revisionPath = `${ref}:${repository.pathspec}`
    const result = await this.git(repository.rootAbsolutePath, ['show', revisionPath])
    return { content: result.stdout, path: input, ref }
  }

  async stage(body: GitPathsBody) {
    recordGitServiceOperation('stage', body.paths[0] ?? '', {
      pathCount: mutationPaths(body).length,
    })
    const target = await this.resolveMutationTarget(body)
    await this.git(target.repository.rootAbsolutePath, ['add', '--all', '--', ...target.pathspecs])
    return this.status(target.repository.rootPath)
  }

  async unstage(body: GitPathsBody) {
    recordGitServiceOperation('unstage', body.paths[0] ?? '', {
      pathCount: mutationPaths(body).length,
    })
    const target = await this.resolveMutationTarget(body)
    await this.git(target.repository.rootAbsolutePath, [
      'restore',
      '--staged',
      '--',
      ...target.pathspecs,
    ])
    return this.status(target.repository.rootPath)
  }

  async discard(body: GitPathsBody) {
    recordGitServiceOperation('discard', body.paths[0] ?? '', {
      pathCount: mutationPaths(body).length,
    })
    const target = await this.resolveMutationTarget(body)
    const restore = await this.git(
      target.repository.rootAbsolutePath,
      ['restore', '--worktree', '--'].concat(target.pathspecs),
      { allowFailure: true },
    )
    const clean = await this.git(
      target.repository.rootAbsolutePath,
      ['clean', '-f', '--'].concat(target.pathspecs),
      { allowFailure: true },
    )
    if (restore.exitCode !== 0 && clean.exitCode !== 0) {
      throw new FsError('GIT_COMMAND_FAILED', gitErrorMessage(restore))
    }

    return this.status(target.repository.rootPath)
  }

  async applyPatch(body: GitApplyPatchBody) {
    recordGitServiceOperation('apply_patch', body.path, {
      patchBytes: Buffer.byteLength(body.patch, 'utf8'),
      reverse: body.reverse,
      target: body.target,
    })
    const repository = await this.requiredRepository(body.path)
    const args = ['apply', '--whitespace=nowarn']
    if (body.target === 'index') args.push('--cached')
    if (body.reverse) args.push('--reverse')

    await this.git(repository.rootAbsolutePath, args, { input: body.patch })
    return this.status(repository.rootPath)
  }

  async commit(body: GitCommitBody) {
    recordGitServiceOperation('commit', body.path, {
      messageBytes: Buffer.byteLength(body.message, 'utf8'),
    })
    const repository = await this.requiredRepository(body.path)
    const message = body.message.trim()
    if (!message) return this.openCommitMessage(repository)

    const result = await this.git(repository.rootAbsolutePath, ['commit', '-m', message])
    return {
      kind: 'committed' as const,
      output: result.stdout.trim(),
      repository: repository.info,
    }
  }

  async branches(input = ''): Promise<GitBranchesResult> {
    recordGitServiceOperation('branches', input)
    const repository = await this.resolveRepository(input)
    if (!repository) return { repository: null, branches: [] }

    const format = '%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(objectname:short)%00'
    const result = await this.git(repository.rootAbsolutePath, ['branch', '--format', format])
    const branches = {
      repository: repository.info,
      branches: parseBranches(result.stdout),
    }
    recordRequestContext({ git: { branchCount: branches.branches.length } })
    return branches
  }

  async checkout(body: GitCheckoutBody) {
    recordGitServiceOperation('checkout', body.path)
    const repository = await this.requiredRepositoryLocation(body.path)
    await this.git(repository.rootAbsolutePath, ['checkout', body.branch])
    return this.status(repository.rootPath)
  }

  async createBranch(body: GitCreateBranchBody) {
    recordGitServiceOperation('create_branch', body.path, {
      checkout: body.checkout,
    })
    const repository = await this.requiredRepositoryLocation(body.path)
    const args = ['branch', body.branch]
    if (body.startPoint) args.push(body.startPoint)

    await this.git(repository.rootAbsolutePath, args)
    if (body.checkout) {
      await this.git(repository.rootAbsolutePath, ['checkout', body.branch])
    }
    return this.branches(repository.rootPath)
  }

  async fetch(input = '') {
    recordGitServiceOperation('fetch', input)
    const repository = await this.requiredRepository(input)
    const result = await this.git(repository.rootAbsolutePath, ['fetch'])
    return { output: commandOutput(result), repository: repository.info }
  }

  async pull(input = '') {
    recordGitServiceOperation('pull', input)
    const repository = await this.requiredRepository(input)
    const result = await this.git(repository.rootAbsolutePath, ['pull'])
    return { output: commandOutput(result), repository: repository.info }
  }

  async push(input = '') {
    recordGitServiceOperation('push', input)
    const repository = await this.requiredRepository(input)
    const result = await this.git(repository.rootAbsolutePath, ['push'])
    return { output: commandOutput(result), repository: repository.info }
  }

  private async resolveMutationTarget(body: GitPathsBody) {
    const paths = mutationPaths(body)
    const repository = await this.requiredRepositoryLocation(paths[0])
    const pathspecs = paths.map(
      (input) => this.pathspecForRepository(repository.rootDisplayAbsolutePath, input) ?? '.',
    )

    return { pathspecs, repository }
  }

  private async requiredRepository(input = '') {
    const repository = await this.resolveRepository(input)
    if (!repository) throw new FsError('GIT_REPOSITORY_NOT_FOUND')

    return repository
  }

  private async requiredRepositoryLocation(input = '') {
    const repository = await this.resolveRepositoryLocation(input)
    if (!repository) throw new FsError('GIT_REPOSITORY_NOT_FOUND')

    return repository
  }

  private async resolveRepository(input = ''): Promise<GitRepository | null> {
    const location = await this.resolveRepositoryLocation(input)
    if (!location) return null

    const info = await this.repositoryInfo(location.rootAbsolutePath, location.rootPath)

    return { ...location, info }
  }

  private async resolveRepositoryLocation(input = ''): Promise<GitRepositoryLocation | null> {
    const resolved = this.resolveServicePath(input)
    const cwd = await gitCwdForPath(resolved.absolutePath)
    const root = await this.git(cwd, ['rev-parse', '--show-toplevel', '--show-prefix'], {
      allowFailure: true,
    })
    if (root.exitCode !== 0) return null

    const [rootOutput = '', prefix = ''] = root.stdout.split(/\r?\n/)
    const rootAbsolutePath = path.resolve(rootOutput)
    const rootDisplayAbsolutePath = lexicalRepositoryRoot(cwd, prefix)
    this.paths.assertRealInside(rootAbsolutePath)
    this.paths.assertInside(rootDisplayAbsolutePath)
    const rootPath = this.paths.toRelative(rootDisplayAbsolutePath)
    const pathspec = this.pathspecForRepository(rootDisplayAbsolutePath, input)

    return {
      pathspec,
      rootAbsolutePath,
      rootDisplayAbsolutePath,
      rootPath,
    }
  }

  private pathspecForRepository(rootAbsolutePath: string, input = '') {
    const absolutePath = this.resolveServicePath(input).absolutePath
    const relative = path.relative(rootAbsolutePath, absolutePath)
    if (relative === '') return null
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new FsError('GIT_REPOSITORY_NOT_FOUND')
    }

    return toPosix(relative)
  }

  private resolveServicePath(input = '') {
    if (!path.isAbsolute(input)) return this.paths.resolve(input)

    const absolutePath = path.resolve(input)
    this.paths.assertInside(absolutePath)

    return {
      absolutePath,
      relativePath: this.paths.toRelative(absolutePath),
    }
  }

  private async repositoryInfo(
    rootAbsolutePath: string,
    rootPath: string,
  ): Promise<GitRepositoryInfo> {
    const result = await this.git(rootAbsolutePath, [
      'status',
      '--porcelain=v2',
      '--branch',
      '-z',
      '--untracked-files=no',
    ])
    return parseRepositoryInfo(result.stdout, rootPath)
  }

  private async diffPathspecArgs(
    repository: GitRepositoryLocation,
    staged: boolean,
  ): Promise<string[]> {
    if (!repository.pathspec) return []

    const related = await this.relatedDiffPathspecs(repository, staged)
    return ['--'].concat(related)
  }

  private async relatedDiffPathspecs(repository: GitRepositoryLocation, staged: boolean) {
    const pathspec = repository.pathspec
    if (!pathspec) return []

    const result = await this.git(repository.rootAbsolutePath, [
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
    ])
    const files = parseStatus(result.stdout, repository.rootPath)
    const matched = files.find((file) => statusMatchesPathspec(file, repository, staged))
    if (!matched?.oldPath) return [pathspec]

    return [
      repositoryRelativePath(repository.rootPath, matched.oldPath),
      repositoryRelativePath(repository.rootPath, matched.path),
    ].filter((pathspec) => pathspec.length > 0)
  }

  private async withDiffSnapshotRefs(
    repository: GitRepositoryLocation,
    diff: GitFileDiff,
  ): Promise<GitFileDiff> {
    if (isBinaryDiff(diff)) return diff
    if (await this.isDiffTooLarge(repository, diff)) return diff

    const [oldObjectId, newObjectId] = await Promise.all([
      this.diffSideObjectId(repository, diff, 'old'),
      this.diffSideObjectId(repository, diff, 'new'),
    ])

    return {
      ...diff,
      newObjectId: newObjectId ?? undefined,
      oldObjectId: oldObjectId ?? undefined,
    }
  }

  private async withBlobDiffContent(
    repository: GitRepositoryLocation,
    diff: GitFileDiff,
    query: GitBlobDiffQuery,
  ): Promise<GitFileDiff> {
    if (isBinaryDiff(diff)) return this.withBlobObjectIds(diff, query)
    if (await this.isBlobDiffTooLarge(repository, query)) {
      return this.withBlobObjectIds(diff, query)
    }

    const [oldText, newText] = await Promise.all([
      query.oldObjectId ? this.gitObjectText(repository, query.oldObjectId) : '',
      query.newObjectId ? this.gitObjectText(repository, query.newObjectId) : '',
    ])

    return {
      ...diff,
      newObjectId: query.newObjectId,
      newText,
      oldObjectId: query.oldObjectId,
      oldText,
    }
  }

  private withBlobObjectIds(diff: GitFileDiff, query: GitBlobDiffQuery): GitFileDiff {
    return {
      ...diff,
      newObjectId: query.newObjectId,
      oldObjectId: query.oldObjectId,
    }
  }

  private async withRefDiffSnapshotRefs(
    repository: GitRepositoryLocation,
    diff: GitFileDiff,
    input: { oldRef: string; newRef: string },
  ): Promise<GitFileDiff> {
    const [oldObjectId, newObjectId] = await Promise.all([
      this.refDiffObjectId(
        repository,
        input.oldRef,
        diff.oldPath ?? diff.path,
        diff.oldFileMissing,
      ),
      this.refDiffObjectId(repository, input.newRef, diff.path, diff.newFileMissing),
    ])

    return {
      ...diff,
      newObjectId: newObjectId ?? undefined,
      oldObjectId: oldObjectId ?? undefined,
    }
  }

  private async refDiffObjectId(
    repository: GitRepositoryLocation,
    ref: string,
    pathValue: string,
    missing: boolean | undefined,
  ) {
    if (missing) return null

    const relativePath = repositoryRelativePath(repository.rootPath, pathValue)
    if (!relativePath) return null

    return this.gitObjectId(repository, `${ref}:${relativePath}`)
  }

  private async untrackedDiffs(repository: GitRepositoryLocation): Promise<GitFileDiff[]> {
    if (!repository.pathspec) return []

    const files = await this.untrackedFiles(repository)
    const diffableFiles = await mapWithConcurrency(files, this.diffConcurrency, async (file) =>
      this.diffableUntrackedFile(repository, file),
    )
    const outputs = await mapWithConcurrency(
      diffableFiles.filter(isString),
      this.diffConcurrency,
      async (file) => this.noIndexDiff(repository, file),
    )

    return outputs.flatMap((output) => parseDiff(output, repository.rootPath, false))
  }

  private async untrackedFiles(repository: GitRepositoryLocation) {
    if (!repository.pathspec) return []

    const result = await this.git(repository.rootAbsolutePath, [
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      repository.pathspec,
    ])

    return result.stdout.split('\0').filter(Boolean)
  }

  private async diffableUntrackedFile(repository: GitRepositoryLocation, pathspec: string) {
    const size = await this.workingTreeSize(repository, pathspec)
    if (size === null) return null
    if (size > this.maxTextFileBytes) return null

    return pathspec
  }

  private async noIndexDiff(repository: GitRepositoryLocation, pathspec: string) {
    const result = await this.git(
      repository.rootAbsolutePath,
      [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        '--unified=3',
        '--no-index',
        '--',
        '/dev/null',
        pathspec,
      ],
      { allowFailure: true },
    )
    if (result.exitCode <= 1) return result.stdout

    throw new FsError('GIT_COMMAND_FAILED', gitErrorMessage(result))
  }

  private async diffSideObjectId(
    repository: GitRepositoryLocation,
    diff: GitFileDiff,
    side: 'old' | 'new',
  ) {
    if (side === 'old') return this.oldDiffObjectId(repository, diff)

    return this.newDiffObjectId(repository, diff)
  }

  private async oldDiffObjectId(repository: GitRepositoryLocation, diff: GitFileDiff) {
    const path = repositoryRelativePath(repository.rootPath, diff.oldPath ?? diff.path)
    if (!path) return null
    if (diff.oldFileMissing) return null
    if (diff.staged) return this.gitObjectId(repository, `HEAD:${path}`)

    return this.gitObjectId(repository, `:${path}`)
  }

  private async newDiffObjectId(repository: GitRepositoryLocation, diff: GitFileDiff) {
    const path = repositoryRelativePath(repository.rootPath, diff.path)
    if (!path) return null
    if (diff.newFileMissing) return null
    if (diff.staged) return this.gitObjectId(repository, `:${path}`)

    return this.writeWorkingTreeObject(repository, path)
  }

  private async isDiffTooLarge(
    repository: GitRepositoryLocation,
    diff: GitFileDiff,
  ): Promise<boolean> {
    const [oldSize, newSize] = await Promise.all([
      this.diffSideSize(repository, diff, 'old'),
      this.diffSideSize(repository, diff, 'new'),
    ])

    return isTooLarge(oldSize, this.maxTextFileBytes) || isTooLarge(newSize, this.maxTextFileBytes)
  }

  private async gitObjectId(repository: GitRepositoryLocation, revisionPath: string) {
    const result = await this.git(repository.rootAbsolutePath, ['rev-parse', revisionPath], {
      allowFailure: true,
    })
    if (result.exitCode !== 0) return null

    return result.stdout.trim() || null
  }

  private async resolveRefCommit(repository: GitRepositoryLocation, ref: string) {
    const result = await this.git(
      repository.rootAbsolutePath,
      ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
      { allowFailure: true },
    )
    if (result.exitCode !== 0) return null

    return result.stdout.trim() || null
  }

  private async diffSideSize(
    repository: GitRepositoryLocation,
    diff: GitFileDiff,
    side: 'old' | 'new',
  ) {
    if (side === 'old') return this.oldDiffSize(repository, diff)

    return this.newDiffSize(repository, diff)
  }

  private async oldDiffSize(repository: GitRepositoryLocation, diff: GitFileDiff) {
    const path = repositoryRelativePath(repository.rootPath, diff.oldPath ?? diff.path)
    if (!path) return null
    if (diff.oldFileMissing) return null
    if (diff.staged) return this.gitObjectSize(repository, `HEAD:${path}`)

    return this.gitObjectSize(repository, `:${path}`)
  }

  private async newDiffSize(repository: GitRepositoryLocation, diff: GitFileDiff) {
    const path = repositoryRelativePath(repository.rootPath, diff.path)
    if (!path) return null
    if (diff.newFileMissing) return null
    if (diff.staged) return this.gitObjectSize(repository, `:${path}`)

    return this.workingTreeSize(repository, path)
  }

  private async gitObjectSize(repository: GitRepositoryLocation, revisionPath: string) {
    const result = await this.git(repository.rootAbsolutePath, ['cat-file', '-s', revisionPath], {
      allowFailure: true,
    })
    if (result.exitCode !== 0) return null

    const size = Number(result.stdout.trim())
    return Number.isSafeInteger(size) ? size : null
  }

  private async workingTreeSize(repository: GitRepositoryLocation, relativePath: string) {
    const absolutePath = path.join(repository.rootDisplayAbsolutePath, relativePath)
    this.paths.assertInside(absolutePath)

    try {
      const stats = await stat(absolutePath)
      return stats.isFile() ? stats.size : null
    } catch {
      return null
    }
  }

  private async gitObjectText(repository: GitRepositoryLocation, objectId: string) {
    const result = await this.git(repository.rootAbsolutePath, ['cat-file', '-p', objectId])
    return result.stdout
  }

  private async isBlobDiffTooLarge(repository: GitRepositoryLocation, query: GitBlobDiffQuery) {
    const [oldSize, newSize] = await Promise.all([
      query.oldObjectId ? this.gitObjectSize(repository, query.oldObjectId) : null,
      query.newObjectId ? this.gitObjectSize(repository, query.newObjectId) : null,
    ])

    return isTooLarge(oldSize, this.maxTextFileBytes) || isTooLarge(newSize, this.maxTextFileBytes)
  }

  private async blobPatch(repository: GitRepositoryLocation, query: GitBlobDiffQuery) {
    const [oldObjectId, newObjectId] = await Promise.all([
      query.oldObjectId ?? this.emptyBlobObjectId(repository),
      query.newObjectId ?? this.emptyBlobObjectId(repository),
    ])
    if (oldObjectId === newObjectId) return ''

    const result = await this.git(
      repository.rootAbsolutePath,
      ['diff', '--no-color', '--no-ext-diff', '--unified=3', oldObjectId, newObjectId],
      { allowFailure: true },
    )
    if (result.exitCode <= 1) return result.stdout

    throw new FsError('GIT_COMMAND_FAILED', gitErrorMessage(result))
  }

  private async emptyBlobObjectId(repository: GitRepositoryLocation) {
    const result = await this.git(repository.rootAbsolutePath, ['hash-object', '-w', '--stdin'], {
      input: '',
    })
    return result.stdout.trim()
  }

  private async writeWorkingTreeObject(repository: GitRepositoryLocation, relativePath: string) {
    const result = await this.git(repository.rootAbsolutePath, [
      'hash-object',
      '-w',
      '--',
      relativePath,
    ])
    return result.stdout.trim() || null
  }

  private async openCommitMessage(repository: GitRepository): Promise<GitCommitResult> {
    const target = await this.commitMessageTarget(repository)
    const template = await this.commitMessageTemplate(repository)
    await writeFile(target.absolutePath, template, 'utf8')
    return {
      kind: 'message-file',
      path: target.path,
      repository: repository.info,
    }
  }

  private async commitMessageTarget(repository: GitRepositoryLocation) {
    const result = await this.git(repository.rootAbsolutePath, [
      'rev-parse',
      '--git-path',
      'COMMIT_EDITMSG',
    ])
    const gitPath = result.stdout.trim()
    const absolutePath = path.isAbsolute(gitPath)
      ? gitPath
      : path.resolve(repository.rootDisplayAbsolutePath, gitPath)
    this.paths.assertInside(absolutePath)
    return { absolutePath, path: this.paths.toRelative(absolutePath) }
  }

  private async commitMessageTemplate(repository: GitRepositoryLocation) {
    const result = await this.git(repository.rootAbsolutePath, [
      'status',
      '--short',
      '--branch',
      '--untracked-files=all',
    ])
    return commitMessageTemplate(result.stdout)
  }

  private async git(
    cwd: string,
    args: readonly string[],
    options: { allowFailure?: boolean; input?: string } = {},
  ): Promise<GitCommandResult> {
    const startedAt = performance.now()
    const process = Bun.spawn(['git', '-C', cwd].concat(args), {
      stderr: 'pipe',
      stdin: options.input === undefined ? 'ignore' : 'pipe',
      stdout: 'pipe',
    })

    if (options.input !== undefined) {
      await writeProcessInput(process.stdin, options.input)
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])
    const result = { exitCode, stderr, stdout }
    recordGitCommand({
      action: gitAction(args),
      allowFailure: options.allowFailure ?? false,
      durationMs: elapsedMs(startedAt),
      exitCode,
      stderrTail: exitCode === 0 ? undefined : limitText(stderr, 500),
    })
    if (options.allowFailure || exitCode === 0) return result

    throw new FsError('GIT_COMMAND_FAILED', gitErrorMessage(result))
  }
}

async function mapWithConcurrency<T, U>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
) {
  const results: U[] = []
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await mapper(items[index], index)
    }
  })

  await Promise.all(workers)
  return results
}

function positiveInteger(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 1) return fallback

  return value
}

function isBinaryDiff(diff: GitFileDiff) {
  return diff.patch.includes('\nBinary files ') || diff.patch.includes('\nGIT binary patch')
}

function isTooLarge(size: number | null, maxBytes: number) {
  return size !== null && size > maxBytes
}

function isString(value: string | null): value is string {
  return typeof value === 'string'
}

function recordGitServiceOperation(
  operation: string,
  path = '',
  fields: Record<string, unknown> = {},
) {
  recordRequestContext({
    area: 'git',
    git: {
      operation,
      path,
      ...fields,
    },
    operation,
  })
}

function gitAction(args: readonly string[]) {
  return args[0] ?? 'unknown'
}
