import { lstat, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { FsError } from "../fs/errors"
import type { WorkspacePaths } from "../fs/path"
import { toPosix } from "../fs/path"
import type {
  GitApplyPatchBody,
  GitCheckoutBody,
  GitCommitBody,
  GitCreateBranchBody,
  GitPathsBody,
} from "./contracts"

export type GitTreeStatus =
  | "added"
  | "deleted"
  | "ignored"
  | "modified"
  | "renamed"
  | "untracked"

export type GitFileStatus = {
  path: string
  oldPath?: string
  index: GitTreeStatus | "unmodified" | "conflicted"
  worktree: GitTreeStatus | "unmodified" | "conflicted"
  status: GitTreeStatus | "conflicted"
}

export type GitRepositoryInfo = {
  branch: string | null
  commit: string | null
  ahead: number
  behind: number
  path: string
}

export type GitStatusResult = {
  repository: GitRepositoryInfo | null
  files: GitFileStatus[]
}

export type GitLineChange = {
  type: "added" | "deleted" | "context"
  oldLine: number | null
  newLine: number | null
  text: string
}

export type GitDiffHunk = {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  patch: string
  changes: GitLineChange[]
}

export type GitFileDiff = {
  path: string
  oldPath?: string
  oldFileMissing?: boolean
  newFileMissing?: boolean
  oldText?: string
  newText?: string
  staged: boolean
  patch: string
  hunks: GitDiffHunk[]
}

export type GitBranch = {
  current: boolean
  name: string
  upstream: string | null
  commit: string
}

export type GitBranchesResult = {
  repository: GitRepositoryInfo | null
  branches: GitBranch[]
}

export type GitCommitResult =
  | {
      kind: "committed"
      output: string
      repository: GitRepositoryInfo
    }
  | {
      kind: "message-file"
      path: string
      repository: GitRepositoryInfo
    }

type GitCommandResult = {
  stdout: string
  stderr: string
  exitCode: number
}

type GitRepository = {
  rootAbsolutePath: string
  rootDisplayAbsolutePath: string
  rootPath: string
  pathspec: string | null
  info: GitRepositoryInfo
}

const STATUS_BRANCH_PREFIX = "# branch."
const HUNK_HEADER_PATTERN =
  /^@@ -(?<oldStart>\d+)(?:,(?<oldLines>\d+))? \+(?<newStart>\d+)(?:,(?<newLines>\d+))? @@/

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
    const repository = await this.resolveRepository(input)
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
      repository: repository.info,
      files: parseStatus(result.stdout, repository.rootPath),
    }
  }

  async diff(input = "", staged = false): Promise<GitFileDiff[]> {
    const repository = await this.resolveRepository(input)
    if (!repository) return []

    const args = [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--find-renames",
      "--unified=3",
      ...(staged ? ["--cached"] : []),
      ...pathspecArgs(repository.pathspec),
    ]
    const result = await this.git(repository.rootAbsolutePath, args)
    const diffs = parseDiff(result.stdout, repository.rootPath, staged)
    return Promise.all(
      diffs.map((diff) => this.withDiffContent(repository, diff))
    )
  }

  async file(input: string, ref: string) {
    const repository = await this.resolveRepository(input)
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
    const repository = await this.requiredRepository(body.path)
    await this.git(repository.rootAbsolutePath, ["checkout", body.branch])
    return this.status(repository.rootPath)
  }

  async createBranch(body: GitCreateBranchBody) {
    const repository = await this.requiredRepository(body.path)
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
    const repository = await this.requiredRepository(paths[0])
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

  private async resolveRepository(input = ""): Promise<GitRepository | null> {
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
    const info = await this.repositoryInfo(rootAbsolutePath, rootPath)

    return {
      info,
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

  private async withDiffContent(
    repository: GitRepository,
    diff: GitFileDiff
  ): Promise<GitFileDiff> {
    const [oldText, newText] = await Promise.all([
      this.diffSideContent(repository, diff, "old"),
      this.diffSideContent(repository, diff, "new"),
    ])

    return { ...diff, oldText, newText }
  }

  private async diffSideContent(
    repository: GitRepository,
    diff: GitFileDiff,
    side: "old" | "new"
  ) {
    if (side === "old") return this.oldDiffContent(repository, diff)

    return this.newDiffContent(repository, diff)
  }

  private async oldDiffContent(repository: GitRepository, diff: GitFileDiff) {
    const path = repositoryRelativePath(
      repository.rootPath,
      diff.oldPath ?? diff.path
    )
    if (!path) return ""
    if (diff.oldFileMissing) return ""
    if (diff.staged) return this.gitText(repository, `HEAD:${path}`)

    return this.gitText(repository, `:${path}`)
  }

  private async newDiffContent(repository: GitRepository, diff: GitFileDiff) {
    const path = repositoryRelativePath(repository.rootPath, diff.path)
    if (!path) return ""
    if (diff.newFileMissing) return ""
    if (diff.staged) return this.gitText(repository, `:${path}`)

    return this.workingTreeText(repository, path)
  }

  private async gitText(repository: GitRepository, revisionPath: string) {
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

  private async workingTreeText(
    repository: GitRepository,
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

  private async commitMessageTarget(repository: GitRepository) {
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

  private async commitMessageTemplate(repository: GitRepository) {
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

async function writeProcessInput(
  stdin: Bun.FileSink | undefined,
  input: string
) {
  if (!stdin) return

  stdin.write(input)
  stdin.end()
}

async function gitCwdForPath(absolutePath: string) {
  try {
    const stat = await lstat(absolutePath)
    if (stat.isDirectory()) return absolutePath
  } catch {
    return path.dirname(absolutePath)
  }

  return path.dirname(absolutePath)
}

function lexicalRepositoryRoot(cwd: string, prefix: string) {
  const segments = prefix.split("/").filter(Boolean)
  if (segments.length === 0) return cwd

  return path.resolve(cwd, ...segments.map(() => ".."))
}

function parseRepositoryInfo(
  output: string,
  rootPath: string
): GitRepositoryInfo {
  const branch = {
    ahead: 0,
    behind: 0,
    commit: null as string | null,
    name: null as string | null,
  }

  for (const record of output.split("\0")) {
    if (!record.startsWith(STATUS_BRANCH_PREFIX)) continue

    applyBranchRecord(branch, record)
  }

  return {
    ahead: branch.ahead,
    behind: branch.behind,
    branch: branch.name,
    commit: branch.commit,
    path: rootPath,
  }
}

function applyBranchRecord(
  branch: {
    ahead: number
    behind: number
    commit: string | null
    name: string | null
  },
  record: string
) {
  const value = record.slice(STATUS_BRANCH_PREFIX.length)
  if (value.startsWith("oid ")) {
    branch.commit = value.slice(4) === "(initial)" ? null : value.slice(4)
    return
  }
  if (value.startsWith("head ")) {
    branch.name = value.slice(5) === "(detached)" ? null : value.slice(5)
    return
  }
  if (!value.startsWith("ab ")) return

  const match = /\+(\d+) -(\d+)/.exec(value)
  branch.ahead = Number(match?.[1] ?? 0)
  branch.behind = Number(match?.[2] ?? 0)
}

function commitMessageTemplate(statusOutput: string) {
  const records = statusOutput.split(/\r?\n/).filter(Boolean)
  const branch = records[0]?.startsWith("## ") ? records.shift() : undefined
  const sections = commitStatusSections(records)
  const lines = [
    "",
    "# Please enter the commit message for your changes. Lines starting",
    "# with '#' will be ignored, and an empty message aborts the commit.",
    "#",
    ...commitBranchLines(branch),
    "#",
    ...commitSectionLines("Changes to be committed:", sections.staged),
    ...commitSectionLines("Changes not staged for commit:", sections.unstaged),
    ...commitSectionLines("Untracked files:", sections.untracked),
  ]

  return ensureTrailingNewline(lines.join("\n"))
}

function commitBranchLines(branchRecord: string | undefined) {
  const branch = parseShortBranchRecord(branchRecord)
  if (!branch) return ["# On branch HEAD"]

  const lines = [`# On branch ${branch.name}`]
  const upstreamLines = commitUpstreamLines(branch)
  if (upstreamLines.length > 0) lines.push(...upstreamLines)
  return lines
}

function commitUpstreamLines(branch: ShortBranch) {
  if (!branch.upstream) return []
  if (branch.ahead > 0 && branch.behind > 0) {
    return [
      `# Your branch and '${branch.upstream}' have diverged,`,
      `# and have ${commitCount(branch.ahead)} and ${commitCount(branch.behind)} different commits each, respectively.`,
    ]
  }
  if (branch.ahead > 0) {
    return [
      `# Your branch is ahead of '${branch.upstream}' by ${commitCount(branch.ahead)}.`,
      '#   (use "git push" to publish your local commits)',
    ]
  }
  if (branch.behind > 0) {
    return [
      `# Your branch is behind '${branch.upstream}' by ${commitCount(branch.behind)}.`,
      '#   (use "git pull" to update your local branch)',
    ]
  }

  return []
}

type ShortBranch = {
  ahead: number
  behind: number
  name: string
  upstream: string | null
}

function parseShortBranchRecord(
  record: string | undefined
): ShortBranch | null {
  if (!record) return null

  const text = record.slice(3)
  const statusMatch = /\[(?<status>[^\]]+)\]$/.exec(text)
  const withoutStatus = text.replace(/\s+\[[^\]]+\]$/, "")
  const [namePart = withoutStatus, upstream = null] = withoutStatus.split("...")
  const noCommitsPrefix = "No commits yet on "
  const name = namePart.startsWith(noCommitsPrefix)
    ? namePart.slice(noCommitsPrefix.length)
    : namePart

  return {
    ahead: statusCount(statusMatch?.groups?.status, "ahead"),
    behind: statusCount(statusMatch?.groups?.status, "behind"),
    name,
    upstream,
  }
}

function statusCount(status: string | undefined, key: "ahead" | "behind") {
  const match = new RegExp(`${key} (\\d+)`).exec(status ?? "")
  return Number(match?.[1] ?? 0)
}

function commitStatusSections(records: readonly string[]) {
  const sections = {
    staged: [] as string[],
    unstaged: [] as string[],
    untracked: [] as string[],
  }
  for (const record of records) appendCommitStatusRecord(sections, record)
  return sections
}

function appendCommitStatusRecord(
  sections: {
    staged: string[]
    unstaged: string[]
    untracked: string[]
  },
  record: string
) {
  const indexStatus = record[0] ?? " "
  const worktreeStatus = record[1] ?? " "
  const file = record.slice(3)
  if (indexStatus === "?" && worktreeStatus === "?") {
    sections.untracked.push(file)
    return
  }
  if (indexStatus !== " ") {
    sections.staged.push(commitStatusLine(indexStatus, file))
  }
  if (worktreeStatus !== " ") {
    sections.unstaged.push(commitStatusLine(worktreeStatus, file))
  }
}

function commitStatusLine(status: string, file: string) {
  return `${commitStatusLabel(status)}:   ${file}`
}

function commitStatusLabel(status: string) {
  if (status === "A") return "new file"
  if (status === "D") return "deleted"
  if (status === "R") return "renamed"
  if (status === "C") return "copied"
  if (status === "U") return "unmerged"

  return "modified"
}

function commitSectionLines(title: string, files: readonly string[]) {
  if (files.length === 0) return []

  return ["#", `# ${title}`, ...files.map((file) => `#\t${file}`), "#"]
}

function commitCount(count: number) {
  return `${count} ${count === 1 ? "commit" : "commits"}`
}

function parseStatus(output: string, rootPath: string): GitFileStatus[] {
  const records = output.split("\0")
  const files: GitFileStatus[] = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record) continue
    if (record.startsWith("#")) continue

    const parsed = parseStatusRecord(records, index, rootPath)
    if (!parsed) continue

    files.push(parsed.file)
    index = parsed.nextIndex
  }

  return files
}

function parseStatusRecord(
  records: readonly string[],
  index: number,
  rootPath: string
) {
  const record = records[index] ?? ""
  if (record.startsWith("1 "))
    return parseOrdinaryStatus(record, rootPath, index)
  if (record.startsWith("2 "))
    return parseRenamedStatus(records, rootPath, index)
  if (record.startsWith("u "))
    return parseUnmergedStatus(record, rootPath, index)
  if (record.startsWith("? "))
    return untrackedStatus(record.slice(2), rootPath, index)
  if (record.startsWith("! "))
    return ignoredStatus(record.slice(2), rootPath, index)

  return null
}

function parseOrdinaryStatus(record: string, rootPath: string, index: number) {
  const fields = splitFields(record, 9)
  if (fields.length < 9) return null

  const indexStatus = statusChar(fields[1]?.[0])
  const worktree = statusChar(fields[1]?.[1])
  return {
    file: {
      index: indexStatus,
      path: joinPath(rootPath, fields[8] ?? ""),
      status: effectiveStatus(indexStatus, worktree),
      worktree,
    },
    nextIndex: index,
  }
}

function parseRenamedStatus(
  records: readonly string[],
  rootPath: string,
  index: number
) {
  const fields = splitFields(records[index] ?? "", 10)
  if (fields.length < 10) return null

  const indexStatus = statusChar(fields[1]?.[0])
  const worktree = statusChar(fields[1]?.[1])
  return {
    file: {
      index: indexStatus,
      oldPath: joinPath(rootPath, records[index + 1] ?? ""),
      path: joinPath(rootPath, fields[9] ?? ""),
      status: effectiveStatus(indexStatus, worktree),
      worktree,
    },
    nextIndex: index + 1,
  }
}

function parseUnmergedStatus(record: string, rootPath: string, index: number) {
  const fields = splitFields(record, 11)
  if (fields.length < 11) return null

  return {
    file: {
      index: "conflicted" as const,
      path: joinPath(rootPath, fields[10] ?? ""),
      status: "conflicted" as const,
      worktree: "conflicted" as const,
    },
    nextIndex: index,
  }
}

function untrackedStatus(path: string, rootPath: string, index: number) {
  return {
    file: {
      index: "untracked" as const,
      path: joinPath(rootPath, path),
      status: "untracked" as const,
      worktree: "untracked" as const,
    },
    nextIndex: index,
  }
}

function ignoredStatus(path: string, rootPath: string, index: number) {
  return {
    file: {
      index: "ignored" as const,
      path: joinPath(rootPath, path),
      status: "ignored" as const,
      worktree: "ignored" as const,
    },
    nextIndex: index,
  }
}

function statusChar(
  value: string | undefined
): GitFileStatus["index"] | GitFileStatus["worktree"] {
  if (!value || value === ".") return "unmodified"
  if (value === "M" || value === "T") return "modified"
  if (value === "A") return "added"
  if (value === "D") return "deleted"
  if (value === "R") return "renamed"
  if (value === "C") return "renamed"
  if (value === "U") return "conflicted"

  return "modified"
}

function effectiveStatus(
  indexStatus: GitFileStatus["index"],
  worktree: GitFileStatus["worktree"]
): GitFileStatus["status"] {
  if (worktree !== "unmodified") return worktree
  if (indexStatus !== "unmodified") return indexStatus

  return "modified"
}

function parseDiff(output: string, rootPath: string, staged: boolean) {
  const diffs: MutableGitFileDiff[] = []
  let current: MutableGitFileDiff | null = null
  let hunk: MutableGitDiffHunk | null = null

  for (const line of diffLines(output)) {
    if (line.startsWith("diff --git ")) {
      current = startDiffFile(diffs, rootPath, staged, line)
      hunk = null
      continue
    }
    if (!current) continue

    current.lines.push(line)
    if (line.startsWith("rename from "))
      current.oldPath = joinPath(rootPath, line.slice(12))
    if (line.startsWith("rename to "))
      current.path = joinPath(rootPath, line.slice(10))
    if (line === "--- /dev/null") current.oldFileMissing = true
    if (line.startsWith("--- "))
      current.oldPath = diffPath(rootPath, line, "a/")
    if (line === "+++ /dev/null") current.newFileMissing = true
    if (line.startsWith("+++ ")) {
      current.path = diffPath(rootPath, line, "b/") ?? current.path
    }
    if (line.startsWith("@@ ")) {
      hunk = startDiffHunk(current, line)
      continue
    }
    if (!hunk) continue

    applyDiffLine(hunk, line)
  }

  return diffs.map((diff) => ({
    hunks: diff.hunks.map(finalizeHunk),
    newFileMissing: diff.newFileMissing,
    oldFileMissing: diff.oldFileMissing,
    oldPath: diff.oldPath === diff.path ? undefined : diff.oldPath,
    patch: ensureTrailingNewline(diff.lines.join("\n")),
    path: diff.path,
    staged: diff.staged,
  }))
}

function diffLines(output: string) {
  if (!output) return []
  if (!output.endsWith("\n")) return output.split("\n")

  return output.slice(0, -1).split("\n")
}

type MutableGitFileDiff = {
  path: string
  oldPath?: string
  oldFileMissing?: boolean
  newFileMissing?: boolean
  staged: boolean
  lines: string[]
  hunks: MutableGitDiffHunk[]
}

type MutableGitDiffHunk = Omit<GitDiffHunk, "patch"> & {
  lines: string[]
  oldLine: number
  newLine: number
}

function startDiffFile(
  diffs: MutableGitFileDiff[],
  rootPath: string,
  staged: boolean,
  line: string
) {
  const path = diffGitPath(line)
  const diff = {
    hunks: [],
    lines: [line],
    path: joinPath(rootPath, path),
    staged,
  }

  diffs.push(diff)
  return diff
}

function startDiffHunk(current: MutableGitFileDiff, line: string) {
  const match = HUNK_HEADER_PATTERN.exec(line)
  const oldStart = Number(match?.groups?.oldStart ?? 0)
  const oldLines = Number(match?.groups?.oldLines ?? 1)
  const newStart = Number(match?.groups?.newStart ?? 0)
  const newLines = Number(match?.groups?.newLines ?? 1)
  const hunk: MutableGitDiffHunk = {
    changes: [],
    header: line,
    lines: [line],
    newLine: newStart,
    newLines,
    newStart,
    oldLine: oldStart,
    oldLines,
    oldStart,
  }

  current.hunks.push(hunk)
  return hunk
}

function applyDiffLine(hunk: MutableGitDiffHunk, line: string) {
  hunk.lines.push(line)
  if (line.startsWith("\\ No newline")) return

  const type = diffLineType(line)
  if (type === "added") {
    hunk.changes.push({
      newLine: hunk.newLine,
      oldLine: null,
      text: line.slice(1),
      type,
    })
    hunk.newLine += 1
    return
  }
  if (type === "deleted") {
    hunk.changes.push({
      newLine: null,
      oldLine: hunk.oldLine,
      text: line.slice(1),
      type,
    })
    hunk.oldLine += 1
    return
  }

  hunk.changes.push({
    newLine: hunk.newLine,
    oldLine: hunk.oldLine,
    text: line.slice(1),
    type,
  })
  hunk.newLine += 1
  hunk.oldLine += 1
}

function finalizeHunk(hunk: MutableGitDiffHunk): GitDiffHunk {
  return {
    changes: hunk.changes,
    header: hunk.header,
    newLines: hunk.newLines,
    newStart: hunk.newStart,
    oldLines: hunk.oldLines,
    oldStart: hunk.oldStart,
    patch: ensureTrailingNewline(hunk.lines.join("\n")),
  }
}

function diffLineType(line: string): GitLineChange["type"] {
  if (line.startsWith("+")) return "added"
  if (line.startsWith("-")) return "deleted"

  return "context"
}

function diffGitPath(line: string) {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
  return unquoteGitPath(match?.[2] ?? "")
}

function diffPath(rootPath: string, line: string, prefix: "a/" | "b/") {
  const value = line.slice(4)
  if (value === "/dev/null") return undefined
  if (!value.startsWith(prefix)) return undefined

  return joinPath(rootPath, unquoteGitPath(value.slice(2)))
}

function parseBranches(output: string): GitBranch[] {
  const fields = output.split("\0").filter(Boolean)
  const branches: GitBranch[] = []

  for (let index = 0; index < fields.length; index += 4) {
    const name = fields[index]
    const marker = fields[index + 1]
    const upstream = fields[index + 2]
    const commit = fields[index + 3]
    if (!name || !commit) continue

    branches.push({
      commit,
      current: marker === "*",
      name,
      upstream: upstream || null,
    })
  }

  return branches
}

function mutationPaths(body: GitPathsBody) {
  const paths = body.paths?.length ? body.paths : body.path ? [body.path] : []
  if (paths.length > 0) return paths

  throw new FsError("INVALID_PATH")
}

function splitFields(record: string, count: number) {
  const fields: string[] = []
  let cursor = 0

  for (let field = 1; field < count; field += 1) {
    const index = record.indexOf(" ", cursor)
    if (index < 0) return [...fields, record.slice(cursor)]

    fields.push(record.slice(cursor, index))
    cursor = index + 1
  }

  fields.push(record.slice(cursor))
  return fields
}

function pathspecArgs(pathspec: string | null) {
  if (!pathspec) return []

  return ["--", pathspec]
}

function joinPath(rootPath: string, childPath: string | undefined) {
  if (!childPath) return rootPath
  if (!rootPath) return childPath

  return `${rootPath}/${childPath}`
}

function repositoryRelativePath(rootPath: string, filePath: string) {
  if (!rootPath) return filePath
  if (filePath === rootPath) return ""

  const prefix = `${rootPath}/`
  if (!filePath.startsWith(prefix)) return filePath

  return filePath.slice(prefix.length)
}

function unquoteGitPath(value: string) {
  if (!value.startsWith('"')) return value

  try {
    return JSON.parse(value) as string
  } catch {
    return value.slice(1, -1)
  }
}

function ensureTrailingNewline(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`
}

function commandOutput(result: GitCommandResult) {
  const output = `${result.stdout}${result.stderr}`.trim()
  return output || "ok"
}

function gitErrorMessage(result: GitCommandResult) {
  const message = `${result.stderr}${result.stdout}`.trim()
  return message || "git command failed"
}
