import { describe, expect, it } from 'vitest'

import {
  WORKSPACE_ROOT_RELATIVE_PATH,
  isPathInWorkspace,
  normalizeWorkspaceRoot,
  toWorkspaceAbsolute,
  toWorkspaceRelative,
  workspacePathLeaf,
} from '@/features/address/utils/workspace-path'

const ROOT = '/Users/dev/code/platform'

describe('normalizeWorkspaceRoot', () => {
  it('strips trailing slashes', () => {
    expect(normalizeWorkspaceRoot('/a/b/')).toBe('/a/b')
    expect(normalizeWorkspaceRoot('/a/b///')).toBe('/a/b')
    expect(normalizeWorkspaceRoot('/a/b')).toBe('/a/b')
  })
})

describe('workspacePathLeaf', () => {
  it('is the leaf directory name', () => {
    expect(workspacePathLeaf(ROOT)).toBe('platform')
    expect(workspacePathLeaf('/Users/test/workspace/platform/')).toBe('platform')
  })

  it('falls back rather than returning an empty name', () => {
    expect(workspacePathLeaf('/')).toBe('Workspace')
    expect(workspacePathLeaf('')).toBe('Workspace')
  })
})

describe('isPathInWorkspace', () => {
  it('accepts the root and its descendants', () => {
    expect(isPathInWorkspace(ROOT, ROOT)).toBe(true)
    expect(isPathInWorkspace(`${ROOT}/apps/web/src/main.tsx`, ROOT)).toBe(true)
  })

  it('rejects siblings that merely share a prefix', () => {
    expect(isPathInWorkspace('/Users/dev/code/platform-2/a.ts', ROOT)).toBe(false)
    expect(isPathInWorkspace('/Users/dev/code/other/a.ts', ROOT)).toBe(false)
  })

  it('rejects everything when there is no root', () => {
    expect(isPathInWorkspace('/a.ts', '')).toBe(false)
  })
})

describe('toWorkspaceRelative / toWorkspaceAbsolute', () => {
  it('round-trips a path inside the workspace', () => {
    const absolute = `${ROOT}/apps/web/src/main.tsx`
    const relative = toWorkspaceRelative(ROOT, absolute)

    expect(relative).toBe('apps/web/src/main.tsx')
    expect(toWorkspaceAbsolute(ROOT, relative ?? '')).toBe(absolute)
  })

  it('round-trips the root itself', () => {
    expect(toWorkspaceRelative(ROOT, ROOT)).toBe(WORKSPACE_ROOT_RELATIVE_PATH)
    expect(toWorkspaceAbsolute(ROOT, WORKSPACE_ROOT_RELATIVE_PATH)).toBe(ROOT)
  })

  it('tolerates a trailing slash on the root in both directions', () => {
    expect(toWorkspaceRelative(`${ROOT}/`, `${ROOT}/a.ts`)).toBe('a.ts')
    expect(toWorkspaceAbsolute(`${ROOT}/`, 'a.ts')).toBe(`${ROOT}/a.ts`)
  })

  it('returns null for a path outside the workspace', () => {
    expect(toWorkspaceRelative(ROOT, '/etc/hosts')).toBeNull()
    expect(toWorkspaceRelative(ROOT, '/Users/dev/code/platform-2/a.ts')).toBeNull()
  })

  it('returns null for synthetic document ids, which are not workspace paths', () => {
    expect(toWorkspaceRelative(ROOT, 'search-buffer:%2Fa%2Fb')).toBeNull()
    expect(toWorkspaceRelative(ROOT, 'settings:')).toBeNull()
  })

  // A stored form read against the wrong root must not silently place a tab outside
  // its own workspace.
  it('refuses to absolutize anything that is not relative', () => {
    expect(toWorkspaceAbsolute(ROOT, '/etc/hosts')).toBeNull()
    expect(toWorkspaceAbsolute(ROOT, '../secrets/a.ts')).toBeNull()
    expect(toWorkspaceAbsolute(ROOT, 'apps/../../escape.ts')).toBeNull()
    expect(toWorkspaceAbsolute(ROOT, '')).toBeNull()
    expect(toWorkspaceAbsolute('', 'a.ts')).toBeNull()
  })

  it('keeps a literal `..` inside a filename, which is not a segment', () => {
    expect(toWorkspaceAbsolute(ROOT, 'weird..name.ts')).toBe(`${ROOT}/weird..name.ts`)
  })

  it('round-trips paths with spaces, unicode and reserved URL characters', () => {
    for (const relative of ['a b/c.ts', 'ünïcödé/文件.ts', 'a~b.ts', 'a%20b.ts', 'a#b.ts']) {
      const absolute = `${ROOT}/${relative}`
      expect(toWorkspaceRelative(ROOT, absolute)).toBe(relative)
      expect(toWorkspaceAbsolute(ROOT, relative)).toBe(absolute)
    }
  })
})
