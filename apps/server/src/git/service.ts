import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { FsError } from "../fs/errors"
import type { WorkspacePaths } from "../fs/path"
import { toPosix } from "../fs/path"
import { parseBranches } from "./branches"
import { commandOutput, gitErrorMessage, writeProcessInput } from "./command"
import { commitMessageTemplate } from "./commit-message"
import type {
  GitApplyPatchBody,
  GitBlobDiffQuery,
  GitCheckoutBody,
  GitCommitBody,
  GitCreateBranchBody,
  GitPathsBody,
} from "./contracts"
import { parseDiff, rewriteBlobPatchPaths } from "./diff"
import {
  mutationPaths,
  pathspecArgs,
  repositoryRelativePath,
} from "./path-utils"
import { gitCwdForPath, lexicalRepositoryRoot } from "./repository"
import {
  parseRepositoryInfo,
  parseStatus,
  statusMatchesPathspec,
} from "./status"
import type {
  GitBranchesResult,
  GitCommandResult,
  GitCommitResult,
  GitFileDiff,
  GitRepository,
  GitRepositoryInfo,
  GitStatusResult,
} from "./types"

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
} from "./types"

type GitRepositoryLocation = Omit<GitRepository, "info">

export class GitService {
  private readonly paths: WorkspacePaths

  constructor(paths: WorkspacePaths) {
    this.paths = paths
  }

  async repo(input = "") {
    const repository = await this.resolveRepository(input)
    return { repository: repository?.info ?? null }
  }

  async status(input = ""): Promise<GitStatusResult> {
    const repository = await this.resolveRepositoryLocation(input)
    if (!repository) return { repository: null, files: [] }

    const args = [
      "status",
      "--porcelain=v2",
      "--branch",
      "-z",
      "--untracked-files=all",
      ...pathspecArgs(repository.pathspec),
    ]
    const result = await this.git(repository.rootAbsolutePath, args)
    return {
      repository: parseRepositoryInfo(result.stdout, repository.rootPath),
      files: parseStatus(result.stdout, repository.rootPath),
    }
  }

  async diff(input = "", staged = false): Promise<GitFileDiff[]> {
    const repository = await this.resolveRepositoryLocation(input)
    if (!repository) return []

    const pathspecs = await this.diffPathspecArgs(repository, staged)
    const args = [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--find-renames",
      "--unified=3",
      ...(staged ? ["--cached"] : []),
      ...pathspecs,
    ]
    const result = await this.git(repository.rootAbsolutePath, args)
    const diffs =
      result.stdout || staged
        ? parseDiff(result.stdout, repository.rootPath, staged)
        : await this.untrackedDiffs(repository)
    return Promise.all(
      diffs.map((diff) => this.withDiffContent(repository, diff))
    )
  }

  async diffBlob(query: GitBlobDiffQuery): Promise<GitFileDiff[]> {
    const repository = await this.requiredRepositoryLocation(
      query.path || query.oldPath || ""
    )
    const oldPath = query.oldPath ?? query.path
    const [oldText, newText] = await Promise.all([
      query.oldObjectId
        ? this.gitObjectText(repository, query.oldObjectId)
        : "",
      query.newObjectId
        ? this.gitObjectText(repository, query.newObjectId)
        : "",
    ])
    const rawPatch = await this.textPatch(repository, {
      newObjectId: query.newObjectId,
      newText,
      oldObjectId: query.oldObjectId,
      oldText,
    })
    const patch = rewriteBlobPatchPaths(rawPatch, {
      newObjectId: query.newObjectId,
      oldObjectId: query.oldObjectId,
      oldPath,
      path: query.path,
    })
    const diffs = parseDiff(patch, repository.rootPath, false)

    return diffs.map((diff) => ({
      ...diff,
      newObjectId: query.newObjectId,
      newText,
      oldObjectId: query.oldObjectId,
      oldText,
    }))
  }

  async file(input: string, ref: string) {
    const repository = await this.resolveRepositoryLocation(input)
    if (!repository?.pathspec) throw new FsError("GIT_REPOSITORY_NOT_FOUND")

    const revisionPath = `${ref}:${repository.pathspec}`
    const result = await this.git(repository.rootAbsolutePath, [
      "show",
      revisionPath,
    ])
    return { content: result.stdout, path: input, ref }
  }

  async stage(body: GitPathsBody) {
    const target = await this.resolveMutationTarget(body)
    await this.git(target.repository.rootAbsolutePath, [
      "add",
      "--all",
      "--",
      ...target.pathspecs,
    ])
    return this.status(target.repository.rootPath)
  }

  async unstage(body: GitPathsBody) {
    const target = await this.resolveMutationTarget(body)
    await this.git(target.repository.rootAbsolutePath, [
      "restore",
      "--staged",
      "--",
      ...target.pathspecs,
    ])
    return this.status(target.repository.rootPath)
  }

  async discard(body: GitPathsBody) {
    const target = await this.resolveMutationTarget(body)
    const restore = await this.git(
      target.repository.rootAbsolutePath,
      ["restore", "--worktree", "--", ...target.pathspecs],
      { allowFailure: true }
    )
    const clean = await this.git(
      target.repository.rootAbsolutePath,
      ["clean", "-f", "--", ...target.pathspecs],
      { allowFailure: true }
    )
    if (restore.exitCode !== 0 && clean.exitCode !== 0) {
      throw new FsError("GIT_COMMAND_FAILED", gitErrorMessage(restore))
    }

    return this.status(target.repository.rootPath)
  }

  async applyPatch(body: GitApplyPatchBody) {
    const repository = await this.requiredRepository(body.path)
    const args = ["apply", "--whitespace=nowarn"]
    if (body.target === "index") args.push("--cached")
    if (body.reverse) args.push("--reverse")

    await this.git(repository.rootAbsolutePath, args, { input: body.patch })
    return this.status(repository.rootPath)
  }

  async commit(body: GitCommitBody) {
    const repository = await this.requiredRepository(body.path)
    const message = body.message.trim()
    if (!message) return this.openCommitMessage(repository)

    const result = await this.git(repository.rootAbsolutePath, [
      "commit",
      "-m",
      message,
    ])
    return {
      kind: "committed" as const,
      output: result.stdout.trim(),
      repository: repository.info,
    }
  }

  async branches(input = ""): Promise<GitBranchesResult> {
    const repository = await this.resolveRepository(input)
    if (!repository) return { repository: null, branches: [] }

    const format =
      "%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(objectname:short)%00"
    const result = await this.git(repository.rootAbsolutePath, [
      "branch",
      "--format",
      format,
    ])
    return {
      repository: repository.info,
      branches: parseBranches(result.stdout),
    }
  }

  async checkout(body: GitCheckoutBody) {
    const repository = await this.requiredRepositoryLocation(body.path)
    await this.git(repository.rootAbsolutePath, ["checkout", body.branch])
    return this.status(repository.rootPath)
  }

  async createBranch(body: GitCreateBranchBody) {
    const repository = await this.requiredRepositoryLocation(body.path)
    const args = ["branch", body.branch]
    if (body.startPoint) args.push(body.startPoint)

    await this.git(repository.rootAbsolutePath, args)
    if (body.checkout) {
      await this.git(repository.rootAbsolutePath, ["checkout", body.branch])
    }
    return this.branches(repository.rootPath)
  }

  async fetch(input = "") {
    const repository = await this.requiredRepository(input)
    const result = await this.git(repository.rootAbsolutePath, ["fetch"])
    return { output: commandOutput(result), repository: repository.info }
  }

  async pull(input = "") {
    const repository = await this.requiredRepository(input)
    const result = await this.git(repository.rootAbsolutePath, ["pull"])
    return { output: commandOutput(result), repository: repository.info }
  }

  async push(input = "") {
    const repository = await this.requiredRepository(input)
    const result = await this.git(repository.rootAbsolutePath, ["push"])
    return { output: commandOutput(result), repository: repository.info }
  }

  private async resolveMutationTarget(body: GitPathsBody) {
    const paths = mutationPaths(body)
    const repository = await this.requiredRepositoryLocation(paths[0])
    const pathspecs = paths.map(
      (input) =>
        this.pathspecForRepository(repository.rootDisplayAbsolutePath, input) ??
        "."
    )

    return { pathspecs, repository }
  }

  private async requiredRepository(input = "") {
    const repository = await this.resolveRepository(input)
    if (!repository) throw new FsError("GIT_REPOSITORY_NOT_FOUND")

    return repository
  }

  private async requiredRepositoryLocation(input = "") {
    const repository = await this.resolveRepositoryLocation(input)
    if (!repository) throw new FsError("GIT_REPOSITORY_NOT_FOUND")

    return repository
  }

  private async resolveRepository(input = ""): Promise<GitRepository | null> {
    const location = await this.resolveRepositoryLocation(input)
    if (!location) return null

    const info = await this.repositoryInfo(
      location.rootAbsolutePath,
      location.rootPath
    )

    return { ...location, info }
  }

  private async resolveRepositoryLocation(
    input = ""
  ): Promise<GitRepositoryLocation | null> {
    const resolved = this.paths.resolve(input)
    const cwd = await gitCwdForPath(resolved.absolutePath)
    const root = await this.git(
      cwd,
      ["rev-parse", "--show-toplevel", "--show-prefix"],
      { allowFailure: true }
    )
    if (root.exitCode !== 0) return null

    const [rootOutput = "", prefix = ""] = root.stdout.split(/\r?\n/)
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

  private pathspecForRepository(rootAbsolutePath: string, input = "") {
    const absolutePath = this.paths.resolve(input).absolutePath
    const relative = path.relative(rootAbsolutePath, absolutePath)
    if (relative === "") return null
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new FsError("GIT_REPOSITORY_NOT_FOUND")
    }

    return toPosix(relative)
  }

  private async repositoryInfo(
    rootAbsolutePath: string,
    rootPath: string
  ): Promise<GitRepositoryInfo> {
    const result = await this.git(rootAbsolutePath, [
      "status",
      "--porcelain=v2",
      "--branch",
      "-z",
      "--untracked-files=no",
    ])
    return parseRepositoryInfo(result.stdout, rootPath)
  }

  private async diffPathspecArgs(
    repository: GitRepositoryLocation,
    staged: boolean
  ): Promise<string[]> {
    if (!repository.pathspec) return []

    const related = await this.relatedDiffPathspecs(repository, staged)
    return ["--", ...related]
  }

  private async relatedDiffPathspecs(
    repository: GitRepositoryLocation,
    staged: boolean
  ) {
    const pathspec = repository.pathspec
    if (!pathspec) return []

    const result = await this.git(repository.rootAbsolutePath, [
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
    ])
    const files = parseStatus(result.stdout, repository.rootPath)
    const matched = files.find((file) =>
      statusMatchesPathspec(file, repository, staged)
    )
    if (!matched?.oldPath) return [pathspec]

    return [
      repositoryRelativePath(repository.rootPath, matched.oldPath),
      repositoryRelativePath(repository.rootPath, matched.path),
    ].filter((pathspec) => pathspec.length > 0)
  }

  private async withDiffContent(
    repository: GitRepositoryLocation,
    diff: GitFileDiff
  ): Promise<GitFileDiff> {
    const [oldObjectId, newObjectId, oldText, newText] = await Promise.all([
      this.diffSideObjectId(repository, diff, "old"),
      this.diffSideObjectId(repository, diff, "new"),
      this.diffSideContent(repository, diff, "old"),
      this.diffSideContent(repository, diff, "new"),
    ])

    return {
      ...diff,
      newObjectId: newObjectId ?? undefined,
      newText,
      oldObjectId: oldObjectId ?? undefined,
      oldText,
    }
  }

  private async untrackedDiffs(
    repository: GitRepositoryLocation
  ): Promise<GitFileDiff[]> {
    if (!repository.pathspec) return []

    const files = await this.untrackedFiles(repository)
    const outputs = await Promise.all(
      files.map((file) => this.noIndexDiff(repository, file))
    )

    return outputs.flatMap((output) =>
      parseDiff(output, repository.rootPath, false)
    )
  }

  private async untrackedFiles(repository: GitRepositoryLocation) {
    if (!repository.pathspec) return []

    const result = await this.git(repository.rootAbsolutePath, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      repository.pathspec,
    ])

    return result.stdout.split("\0").filter(Boolean)
  }

  private async noIndexDiff(
    repository: GitRepositoryLocation,
    pathspec: string
  ) {
    const result = await this.git(
      repository.rootAbsolutePath,
      [
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        "--unified=3",
        "--no-index",
        "--",
        "/dev/null",
        pathspec,
      ],
      { allowFailure: true }
    )
    if (result.exitCode <= 1) return result.stdout

    throw new FsError("GIT_COMMAND_FAILED", gitErrorMessage(result))
  }

  private async diffSideContent(
    repository: GitRepositoryLocation,
    diff: GitFileDiff,
    side: "old" | "new"
  ) {
    if (side === "old") return this.oldDiffContent(repository, diff)

    return this.newDiffContent(repository, diff)
  }

  private async diffSideObjectId(
    repository: GitRepositoryLocation,
    diff: GitFileDiff,
    side: "old" | "new"
  ) {
    if (side === "old") return this.oldDiffObjectId(repository, diff)

    return this.newDiffObjectId(repository, diff)
  }

  private async oldDiffContent(
    repository: GitRepositoryLocation,
    diff: GitFileDiff
  ) {
    const path = repositoryRelativePath(
      repository.rootPath,
      diff.oldPath ?? diff.path
    )
    if (!path) return ""
    if (diff.oldFileMissing) return ""
    if (diff.staged) return this.gitText(repository, `HEAD:${path}`)

    return this.gitText(repository, `:${path}`)
  }

  private async oldDiffObjectId(
    repository: GitRepositoryLocation,
    diff: GitFileDiff
  ) {
    const path = repositoryRelativePath(
      repository.rootPath,
      diff.oldPath ?? diff.path
    )
    if (!path) return null
    if (diff.oldFileMissing) return null
    if (diff.staged) return this.gitObjectId(repository, `HEAD:${path}`)

    return this.gitObjectId(repository, `:${path}`)
  }

  private async newDiffContent(
    repository: GitRepositoryLocation,
    diff: GitFileDiff
  ) {
    const path = repositoryRelativePath(repository.rootPath, diff.path)
    if (!path) return ""
    if (diff.newFileMissing) return ""
    if (diff.staged) return this.gitText(repository, `:${path}`)

    return this.workingTreeText(repository, path)
  }

  private async newDiffObjectId(
    repository: GitRepositoryLocation,
    diff: GitFileDiff
  ) {
    const path = repositoryRelativePath(repository.rootPath, diff.path)
    if (!path) return null
    if (diff.newFileMissing) return null
    if (diff.staged) return this.gitObjectId(repository, `:${path}`)

    return this.writeWorkingTreeObject(repository, path)
  }

  private async gitText(
    repository: GitRepositoryLocation,
    revisionPath: string
  ) {
    const result = await this.git(
      repository.rootAbsolutePath,
      ["show", revisionPath],
      {
        allowFailure: true,
      }
    )
    if (result.exitCode !== 0) return ""

    return result.stdout
  }

  private async gitObjectId(
    repository: GitRepositoryLocation,
    revisionPath: string
  ) {
    const result = await this.git(
      repository.rootAbsolutePath,
      ["rev-parse", revisionPath],
      { allowFailure: true }
    )
    if (result.exitCode !== 0) return null

    return result.stdout.trim() || null
  }

  private async gitObjectText(
    repository: GitRepositoryLocation,
    objectId: string
  ) {
    const result = await this.git(repository.rootAbsolutePath, [
      "cat-file",
      "-p",
      objectId,
    ])
    return result.stdout
  }

  private async writeWorkingTreeObject(
    repository: GitRepositoryLocation,
    relativePath: string
  ) {
    const result = await this.git(repository.rootAbsolutePath, [
      "hash-object",
      "-w",
      "--",
      relativePath,
    ])
    return result.stdout.trim() || null
  }

  private async textPatch(
    repository: GitRepositoryLocation,
    input: {
      newObjectId?: string
      newText: string
      oldObjectId?: string
      oldText: string
    }
  ) {
    if (!input.oldObjectId && !input.newObjectId) return ""

    const directory = await mkdtemp(path.join(tmpdir(), "platform-git-diff-"))

    try {
      return await this.temporaryFilePatch(repository, directory, input)
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  }

  private async temporaryFilePatch(
    repository: GitRepositoryLocation,
    directory: string,
    input: {
      newObjectId?: string
      newText: string
      oldObjectId?: string
      oldText: string
    }
  ) {
    const oldPath = path.join(directory, "old")
    const newPath = path.join(directory, "new")
    if (input.oldObjectId) await writeFile(oldPath, input.oldText, "utf8")
    if (input.newObjectId) await writeFile(newPath, input.newText, "utf8")

    const result = await this.git(
      repository.rootAbsolutePath,
      [
        "diff",
        "--no-index",
        "--no-color",
        "--no-ext-diff",
        "--unified=3",
        input.oldObjectId ? oldPath : "/dev/null",
        input.newObjectId ? newPath : "/dev/null",
      ],
      { allowFailure: true }
    )
    if (result.exitCode <= 1) return result.stdout

    throw new FsError("GIT_COMMAND_FAILED", gitErrorMessage(result))
  }

  private async workingTreeText(
    repository: GitRepositoryLocation,
    relativePath: string
  ) {
    const absolutePath = path.join(
      repository.rootDisplayAbsolutePath,
      relativePath
    )
    this.paths.assertInside(absolutePath)

    try {
      return await readFile(absolutePath, "utf8")
    } catch {
      return ""
    }
  }

  private async openCommitMessage(
    repository: GitRepository
  ): Promise<GitCommitResult> {
    const target = await this.commitMessageTarget(repository)
    const template = await this.commitMessageTemplate(repository)
    await writeFile(target.absolutePath, template, "utf8")
    return {
      kind: "message-file",
      path: target.path,
      repository: repository.info,
    }
  }

  private async commitMessageTarget(repository: GitRepositoryLocation) {
    const result = await this.git(repository.rootAbsolutePath, [
      "rev-parse",
      "--git-path",
      "COMMIT_EDITMSG",
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
      "status",
      "--short",
      "--branch",
      "--untracked-files=all",
    ])
    return commitMessageTemplate(result.stdout)
  }

  private async git(
    cwd: string,
    args: readonly string[],
    options: { allowFailure?: boolean; input?: string } = {}
  ): Promise<GitCommandResult> {
    const process = Bun.spawn(["git", "-C", cwd, ...args], {
      stderr: "pipe",
      stdin: options.input === undefined ? "ignore" : "pipe",
      stdout: "pipe",
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
    if (options.allowFailure || exitCode === 0) return result

    throw new FsError("GIT_COMMAND_FAILED", gitErrorMessage(result))
  }
}
