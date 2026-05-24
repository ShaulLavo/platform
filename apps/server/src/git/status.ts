import { joinPath, repositoryRelativePath, splitFields } from './path-utils'
import type { GitFileStatus, GitRepository, GitRepositoryInfo } from './types'

const STATUS_BRANCH_PREFIX = '# branch.'

export function parseRepositoryInfo(output: string, rootPath: string): GitRepositoryInfo {
  const branch = {
    ahead: 0,
    behind: 0,
    commit: null as string | null,
    name: null as string | null,
  }

  for (const record of output.split('\0')) {
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
  record: string,
) {
  const value = record.slice(STATUS_BRANCH_PREFIX.length)
  if (value.startsWith('oid ')) {
    branch.commit = value.slice(4) === '(initial)' ? null : value.slice(4)
    return
  }
  if (value.startsWith('head ')) {
    branch.name = value.slice(5) === '(detached)' ? null : value.slice(5)
    return
  }
  if (!value.startsWith('ab ')) return

  const match = /\+(\d+) -(\d+)/.exec(value)
  branch.ahead = Number(match?.[1] ?? 0)
  branch.behind = Number(match?.[2] ?? 0)
}

export function parseStatus(output: string, rootPath: string): GitFileStatus[] {
  const records = output.split('\0')
  const files: GitFileStatus[] = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (!record) continue
    if (record.startsWith('#')) continue

    const parsed = parseStatusRecord(records, index, rootPath)
    if (!parsed) continue

    files.push(parsed.file)
    index = parsed.nextIndex
  }

  return files
}

function parseStatusRecord(records: readonly string[], index: number, rootPath: string) {
  const record = records[index] ?? ''
  if (record.startsWith('1 ')) return parseOrdinaryStatus(record, rootPath, index)
  if (record.startsWith('2 ')) return parseRenamedStatus(records, rootPath, index)
  if (record.startsWith('u ')) return parseUnmergedStatus(record, rootPath, index)
  if (record.startsWith('? ')) return untrackedStatus(record.slice(2), rootPath, index)
  if (record.startsWith('! ')) return ignoredStatus(record.slice(2), rootPath, index)

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
      path: joinPath(rootPath, fields[8] ?? ''),
      status: effectiveStatus(indexStatus, worktree),
      worktree,
    },
    nextIndex: index,
  }
}

function parseRenamedStatus(records: readonly string[], rootPath: string, index: number) {
  const fields = splitFields(records[index] ?? '', 10)
  if (fields.length < 10) return null

  const indexStatus = statusChar(fields[1]?.[0])
  const worktree = statusChar(fields[1]?.[1])
  return {
    file: {
      index: indexStatus,
      oldPath: joinPath(rootPath, records[index + 1] ?? ''),
      path: joinPath(rootPath, fields[9] ?? ''),
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
      index: 'conflicted' as const,
      path: joinPath(rootPath, fields[10] ?? ''),
      status: 'conflicted' as const,
      worktree: 'conflicted' as const,
    },
    nextIndex: index,
  }
}

function untrackedStatus(path: string, rootPath: string, index: number) {
  return {
    file: {
      index: 'untracked' as const,
      path: joinPath(rootPath, path),
      status: 'untracked' as const,
      worktree: 'untracked' as const,
    },
    nextIndex: index,
  }
}

function ignoredStatus(path: string, rootPath: string, index: number) {
  return {
    file: {
      index: 'ignored' as const,
      path: joinPath(rootPath, path),
      status: 'ignored' as const,
      worktree: 'ignored' as const,
    },
    nextIndex: index,
  }
}

function statusChar(value: string | undefined): GitFileStatus['index'] | GitFileStatus['worktree'] {
  if (!value || value === '.') return 'unmodified'
  if (value === 'M' || value === 'T') return 'modified'
  if (value === 'A') return 'added'
  if (value === 'D') return 'deleted'
  if (value === 'R') return 'renamed'
  if (value === 'C') return 'renamed'
  if (value === 'U') return 'conflicted'

  return 'modified'
}

function effectiveStatus(
  indexStatus: GitFileStatus['index'],
  worktree: GitFileStatus['worktree'],
): GitFileStatus['status'] {
  if (worktree !== 'unmodified') return worktree
  if (indexStatus !== 'unmodified') return indexStatus

  return 'modified'
}

export function statusMatchesPathspec(
  file: GitFileStatus,
  repository: Pick<GitRepository, 'pathspec' | 'rootPath'>,
  staged: boolean,
) {
  const status = staged ? file.index : file.worktree
  if (status === 'unmodified') return false

  const pathspec = repository.pathspec
  if (!pathspec) return true

  const path = repositoryRelativePath(repository.rootPath, file.path)
  const oldPath = file.oldPath ? repositoryRelativePath(repository.rootPath, file.oldPath) : null

  return path === pathspec || oldPath === pathspec
}
