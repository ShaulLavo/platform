import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'bun:test'

import { FsError } from '../errors'
import { createWorkspacePaths, isIgnoredPath, toPosix } from '../path'

describe('workspace paths', () => {
  it('normalizes client paths while keeping resolution inside the workspace', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'platform-paths-'))
    const paths = createWorkspacePaths(root)

    expect(paths.resolve('src/../README.md')).toEqual({
      absolutePath: path.join(root, 'README.md'),
      relativePath: 'README.md',
    })
    expect(paths.toRelative(path.join(root, 'src/index.ts'))).toBe('src/index.ts')
  })

  it('rejects absolute, parent, Windows, and NUL paths', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'platform-paths-'))
    const paths = createWorkspacePaths(root)

    for (const input of ['/tmp/file', '../secret', 'C:/secret', 'a\\b', 'a\0b']) {
      expect(() => paths.resolve(input)).toThrow(FsError)
    }
  })

  it('detects ignored path segments and converts platform separators', () => {
    expect(isIgnoredPath('src/node_modules/pkg/index.js')).toBe(true)
    expect(isIgnoredPath('apps/server/.evlog/logs/2026-05-25.jsonl')).toBe(true)
    expect(isIgnoredPath('src/components/button.tsx')).toBe(false)
    expect(toPosix(['src', 'file.ts'].join(path.sep))).toBe('src/file.ts')
  })
})
