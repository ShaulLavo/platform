import path from 'node:path'
import { realpathSync } from 'node:fs'
import { FsError } from './errors'

export const defaultIgnoredNames = [
  'node_modules',
  '.git',
  '.evlog',
  '.playwright-mcp',
  'logs',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
] as const

export const treeIgnoredNames = defaultIgnoredNames.filter((name) => name !== 'node_modules')

const ignoredNameSetCache = new WeakMap<readonly string[], ReadonlySet<string>>()

export type WorkspacePath = {
  absolutePath: string
  relativePath: string
}

export type WorkspacePaths = ReturnType<typeof createWorkspacePaths>

export function createWorkspacePaths(workspaceRootInput = process.cwd()) {
  const workspaceRoot = path.resolve(workspaceRootInput)
  const workspaceRootReal = realpathSync(workspaceRoot)

  return {
    workspaceRoot,
    workspaceRootReal,
    resolve(input = ''): WorkspacePath {
      const relativePath = normalizeClientPath(input)
      const absolutePath = path.resolve(workspaceRoot, relativePath)
      assertInside(workspaceRoot, absolutePath)

      return { absolutePath, relativePath }
    },
    toRelative(absolutePath: string) {
      assertInside(workspaceRoot, absolutePath)
      return toPosix(path.relative(workspaceRoot, absolutePath))
    },
    assertInside(absolutePath: string) {
      assertInside(workspaceRoot, absolutePath)
    },
    assertRealInside(absolutePath: string) {
      assertInside(workspaceRootReal, absolutePath)
    },
  }
}

export function isIgnoredPath(
  relativePath: string,
  ignoredNames: readonly string[] = defaultIgnoredNames,
) {
  const ignored = ignoredNameSet(ignoredNames)
  const parts = toPosix(relativePath).split('/')

  for (const part of parts) {
    if (!part) continue
    if (ignored.has(part)) return true
  }

  return false
}

export function toPosix(input: string) {
  return input.split(path.sep).join('/')
}

function normalizeClientPath(input: string) {
  assertClientPathShape(input)

  const normalized = path.posix.normalize(input || '.')
  if (normalized === '.') return ''
  if (normalized === '..') throw new FsError('PATH_OUTSIDE_WORKSPACE')
  if (normalized.startsWith('../')) throw new FsError('PATH_OUTSIDE_WORKSPACE')

  return normalized
}

function assertClientPathShape(input: string) {
  if (input.includes('\0')) throw new FsError('INVALID_PATH')
  if (input.includes('\\')) throw new FsError('INVALID_PATH')
  if (path.posix.isAbsolute(input)) throw new FsError('PATH_OUTSIDE_WORKSPACE')
  if (/^[a-zA-Z]:/.test(input)) throw new FsError('PATH_OUTSIDE_WORKSPACE')
}

/**
 * `path.relative` output, not a client path: it carries platform separators, so
 * the escape prefix is `..${path.sep}` rather than `'../'`. A bare `..` escapes;
 * `..foo` is an ordinary filename and must not be mistaken for one.
 */
export function isOutsideRoot(relative: string) {
  if (relative === '..') return true
  if (relative.startsWith(`..${path.sep}`)) return true

  return path.isAbsolute(relative)
}

function assertInside(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  if (relative === '') return
  if (isOutsideRoot(relative)) throw new FsError('PATH_OUTSIDE_WORKSPACE')
}

function ignoredNameSet(ignoredNames: readonly string[]) {
  const cached = ignoredNameSetCache.get(ignoredNames)
  if (cached) return cached

  const ignored = new Set(ignoredNames)
  ignoredNameSetCache.set(ignoredNames, ignored)
  return ignored
}
