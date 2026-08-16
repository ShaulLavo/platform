import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { createWorkspacePaths } from '../path'
import type { WatchServerMessage } from '../contracts'
import { FileSystemService } from '../service'
import { WorkspaceIndex, buildWorkspaceIndex, watchWorkspaceIndex } from '../workspace-index'

const roots: string[] = []
const execFileAsync = promisify(execFile)

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('workspace index', () => {
  it('builds a normalized entry map and ready status from a full scan', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true\n')

    const index = await buildWorkspaceIndex(createWorkspacePaths(root), { reason: 'test' })
    const entry = index.get('src/app.ts')
    const status = index.status()

    expect(entry).toMatchObject({
      basename: 'app.ts',
      contentKind: 'text',
      defaultIgnored: false,
      extension: '.ts',
      fileKind: 'source',
      gitIgnored: false,
      hidden: false,
      path: 'src/app.ts',
      stale: false,
      type: 'file',
    })
    expect(entry?.charBag).toContain('a')
    expect(entry?.charBag).not.toContain('/')
    expect(status).toMatchObject({
      entryCount: index.entries().length,
      fileCount: 1,
      readiness: 'ready',
      rebuildReason: 'test',
      scanWarningCount: 0,
      scanRoot: root,
      skippedEntryCount: 0,
      staleEntryCount: 0,
    })
    expect(status.lastFullScanAtMs).toEqual(expect.any(Number))
    expect(status.lastFullScanDurationMs).toEqual(expect.any(Number))
  })

  it('marks ignored entries and does not descend into ignored directories', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    await mkdir(path.join(root, 'ignored-dir'), { recursive: true })
    await writeFile(path.join(root, '.gitignore'), 'ignored-dir\n*.tmp\n')
    await writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'ignored default\n')
    await writeFile(path.join(root, 'ignored-dir', 'secret.ts'), 'ignored git\n')
    await writeFile(path.join(root, 'notes.tmp'), 'ignored file\n')

    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    expect(index.get('node_modules')).toMatchObject({
      defaultIgnored: true,
      gitIgnored: false,
      type: 'directory',
    })
    expect(index.get('node_modules/pkg/index.js')).toBeUndefined()
    expect(index.get('ignored-dir')).toMatchObject({
      defaultIgnored: false,
      gitIgnored: true,
      type: 'directory',
    })
    expect(index.get('ignored-dir/secret.ts')).toBeUndefined()
    expect(index.get('notes.tmp')).toMatchObject({
      gitIgnored: true,
      type: 'file',
    })
  })

  it('indexes symlink metadata without following symlinked directories', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'target-dir'), { recursive: true })
    await writeFile(path.join(root, 'target-dir', 'inside.ts'), 'inside\n')
    await writeFile(path.join(root, 'target-file.ts'), 'target\n')
    await symlink('target-dir', path.join(root, 'linked-dir'))
    await symlink('target-file.ts', path.join(root, 'linked-file.ts'))

    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    expect(index.get('linked-dir')).toMatchObject({
      targetType: 'directory',
      type: 'symlink',
    })
    expect(index.get('linked-dir/inside.ts')).toBeUndefined()
    expect(index.get('linked-file.ts')).toMatchObject({
      contentKind: 'text',
      fileKind: 'source',
      targetType: 'file',
      type: 'symlink',
    })
  })

  it('detects text, binary, and image-like files from extension and first bytes', async () => {
    const root = await fixtureRoot()
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await writeFile(path.join(root, 'plain'), 'hello from an extensionless text file\n')
    await writeFile(path.join(root, 'blob'), Buffer.from([0, 1, 2, 3]))
    await writeFile(path.join(root, 'blob.txt'), Buffer.from([0, 1, 2, 3]))
    await writeFile(path.join(root, 'ansi.log'), '\u001b[31mhello\u001b[0m\n')
    await writeFile(path.join(root, 'raw-image'), pngBytes)
    await writeFile(path.join(root, 'pixel.png'), pngBytes)
    await symlink('pixel.png', path.join(root, 'linked.png'))

    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    expect(index.get('plain')).toMatchObject({
      contentKind: 'text',
      fileKind: 'other',
    })
    expect(index.get('blob')).toMatchObject({
      contentKind: 'binary',
      fileKind: 'binary',
    })
    expect(index.get('blob.txt')).toMatchObject({
      contentKind: 'binary',
      fileKind: 'binary',
    })
    expect(index.get('ansi.log')).toMatchObject({
      contentKind: 'text',
      fileKind: 'document',
    })
    expect(index.get('raw-image')).toMatchObject({
      contentKind: 'image',
      fileKind: 'image',
    })
    expect(index.get('pixel.png')).toMatchObject({
      contentKind: 'image',
      fileKind: 'image',
    })
    expect(index.get('linked.png')).toMatchObject({
      contentKind: 'image',
      fileKind: 'image',
      targetType: 'file',
      type: 'symlink',
    })
  })

  it('classifies config dotfiles by basename', async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, '.editorconfig'), 'root = true\n')
    await writeFile(path.join(root, '.env'), 'TOKEN=value\n')
    await writeFile(path.join(root, '.env.local'), 'LOCAL=value\n')

    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    expect(index.get('.editorconfig')).toMatchObject({
      extension: '',
      fileKind: 'config',
      hidden: true,
    })
    expect(index.get('.env')).toMatchObject({
      extension: '',
      fileKind: 'config',
      hidden: true,
    })
    expect(index.get('.env.local')).toMatchObject({
      extension: '.local',
      fileKind: 'config',
      hidden: true,
    })
  })

  it('skips unreadable child directories without failing the full scan', async () => {
    const root = await fixtureRoot()
    const lockedPath = path.join(root, 'locked')
    await mkdir(lockedPath)
    await writeFile(path.join(root, 'visible.ts'), 'export const visible = true\n')
    await chmod(lockedPath, 0)

    try {
      const index = await buildWorkspaceIndex(createWorkspacePaths(root))

      expect(index.status()).toMatchObject({ readiness: 'ready' })
      expect(index.get('locked')).toMatchObject({ type: 'directory' })
      expect(index.get('visible.ts')).toMatchObject({ type: 'file' })
    } finally {
      await chmod(lockedPath, 0o700).catch(() => {})
    }
  })

  it('records fifo metadata without changing the public entry type contract', async () => {
    const root = await fixtureRoot()
    await execFileAsync('mkfifo', [path.join(root, 'events.pipe')])

    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    expect(index.get('events.pipe')).toMatchObject({
      contentKind: 'unknown',
      fileKind: 'other',
      specialKind: 'fifo',
      type: 'other',
    })
  })

  it('returns entry snapshots instead of mutable index entries', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true\n')

    const index = await buildWorkspaceIndex(createWorkspacePaths(root))
    const entry = requireEntry(index.get('src/app.ts'))
    const listedEntry = requireEntry(index.entries().find((item) => item.path === 'src/app.ts'))
    const snapshotEntry = requireEntry(
      index.snapshot().entries.find((item) => item.path === 'src/app.ts'),
    )

    entry.stale = true
    listedEntry.stale = true
    snapshotEntry.stale = true

    expect(index.get('src/app.ts')).toMatchObject({ stale: false })
    expect(index.status()).toMatchObject({ staleEntryCount: 0 })
  })

  it('normalizes lookup and stale paths through the same index key', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true\n')

    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    expect(index.get('./src//app.ts')).toMatchObject({
      path: 'src/app.ts',
      stale: false,
    })
    index.markSubtreeStale('src/../src/app.ts')
    expect(index.get('src/app.ts')).toMatchObject({ stale: true })
  })

  it('marks entries stale and reports stale status', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true\n')
    const index = new WorkspaceIndex(createWorkspacePaths(root))

    expect(index.status()).toMatchObject({ readiness: 'cold' })
    await index.rebuild({ reason: 'initial' })
    index.markSubtreeStale('src/app.ts')

    expect(index.get('src/app.ts')).toMatchObject({ stale: true })
    expect(index.status()).toMatchObject({
      readiness: 'stale',
      staleEntryCount: 1,
    })
    expect(index.status().lastIncrementalUpdateAtMs).toEqual(expect.any(Number))
  })

  it('applies create, change, delete, and rename watch events', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    await writeFile(path.join(root, 'src', 'created.ts'), 'export const created = true\n')
    await index.applyWatchEvents([{ type: 'created', path: 'src/created.ts' }])
    expect(index.get('src/created.ts')).toMatchObject({
      contentKind: 'text',
      type: 'file',
    })

    await writeFile(path.join(root, 'src', 'created.ts'), Buffer.from([0, 1, 2, 3]))
    await index.applyWatchEvents([{ type: 'changed', path: 'src/created.ts' }])
    expect(index.get('src/created.ts')).toMatchObject({
      contentKind: 'binary',
      fileKind: 'binary',
    })

    await rm(path.join(root, 'src', 'created.ts'))
    await index.applyWatchEvents([{ type: 'deleted', path: 'src/created.ts' }])
    expect(index.get('src/created.ts')).toBeUndefined()

    await writeFile(path.join(root, 'src', 'old.ts'), 'export const renamed = true\n')
    await index.applyWatchEvents([{ type: 'created', path: 'src/old.ts' }])
    await rename(path.join(root, 'src', 'old.ts'), path.join(root, 'src', 'new.ts'))
    await index.applyWatchEvents([{ type: 'renamed', oldPath: 'src/old.ts', path: 'src/new.ts' }])

    expect(index.get('src/old.ts')).toBeUndefined()
    expect(index.get('src/new.ts')).toMatchObject({
      basename: 'new.ts',
      type: 'file',
    })
  })

  it('updates the service workspace index from FileChangeHub mutations', async () => {
    const root = await fixtureRoot()
    const service = new FileSystemService({
      metadataDatabasePath: ':memory:',
      workspaceRoot: root,
      watch: false,
    })

    try {
      await waitForStatus(service.workspaceIndex, 'ready')

      await service.createFolder({ path: 'src', recursive: true })
      expect(await waitForEntry(service.workspaceIndex, 'src')).toMatchObject({
        type: 'directory',
      })

      await service.createFile({
        content: 'export const app = true\n',
        path: 'src/app.ts',
      })
      expect(await waitForEntry(service.workspaceIndex, 'src/app.ts')).toMatchObject({
        contentKind: 'text',
        type: 'file',
      })

      await service.rename({ from: 'src/app.ts', to: 'src/main.ts' })
      await waitForMissingEntry(service.workspaceIndex, 'src/app.ts')
      expect(await waitForEntry(service.workspaceIndex, 'src/main.ts')).toMatchObject({
        type: 'file',
      })

      await service.delete({ path: 'src/main.ts' })
      await waitForMissingEntry(service.workspaceIndex, 'src/main.ts')
    } finally {
      await service.close()
    }
  })

  it('rebuilds instead of applying incremental events when the index is cold', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'created.ts'), 'export const created = true\n')
    const index = new WorkspaceIndex(createWorkspacePaths(root))

    await index.applyWatchEvents([{ type: 'created', path: 'src/created.ts' }])

    expect(index.status()).toMatchObject({
      readiness: 'ready',
      rebuildReason: 'watch-event-without-ready-index',
    })
    expect(index.get('src')).toMatchObject({ type: 'directory' })
    expect(index.get('src/created.ts')).toMatchObject({ type: 'file' })
  })

  it('keeps watch failure status from being overwritten by an in-flight rebuild', async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, 'indexed.ts'), 'export const indexed = true\n')
    const index = new WorkspaceIndex(createWorkspacePaths(root))

    const startup = index.rebuild({ reason: 'startup' })
    const failure = index.rebuildAndMarkFailed('watch-error', 'watch failed')
    await Promise.all([startup, failure])

    expect(index.get('indexed.ts')).toMatchObject({ type: 'file' })
    expect(index.status()).toMatchObject({
      errorMessage: 'watch failed',
      readiness: 'failed',
      rebuildReason: 'watch-error',
    })
  })

  it('keeps failure status after later filesystem events', async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, 'indexed.ts'), 'export const indexed = true\n')
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    await index.rebuildAndMarkFailed('watch-error', 'watch failed')
    await writeFile(path.join(root, 'late.ts'), 'export const late = true\n')
    await index.applyWatchEvents([{ type: 'created', path: 'late.ts' }])

    expect(index.get('late.ts')).toBeUndefined()
    expect(index.status()).toMatchObject({
      errorMessage: 'watch failed',
      readiness: 'failed',
      rebuildReason: 'watch-error',
    })
  })

  it('keeps failure status when an in-flight refresh finishes late', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true\n')
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    await writeFile(path.join(root, 'src', 'late.ts'), 'export const late = true\n')
    const refresh = index.refresh('src/late.ts')
    index.markFailed('watch-stream-error', 'stream failed')
    await refresh

    expect(index.get('src/late.ts')).toBeUndefined()
    expect(index.status()).toMatchObject({
      errorMessage: 'stream failed',
      readiness: 'failed',
      rebuildReason: 'watch-stream-error',
    })
  })

  it('keeps status stale until every marked entry is refreshed', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'a.ts'), 'export const a = true\n')
    await writeFile(path.join(root, 'src', 'b.ts'), 'export const b = true\n')
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    index.markSubtreeStale('src/a.ts')
    index.markSubtreeStale('src/b.ts')
    await index.refresh('src/a.ts')

    expect(index.status()).toMatchObject({
      readiness: 'stale',
      staleEntryCount: 1,
    })

    await index.refresh('src/b.ts')

    expect(index.status()).toMatchObject({
      readiness: 'ready',
      staleEntryCount: 0,
    })
  })

  it('does not add children under gitignored directories from watch events', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'ignored'), { recursive: true })
    await writeFile(path.join(root, '.gitignore'), 'ignored/\n')
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    await writeFile(path.join(root, 'ignored', 'secret.ts'), 'export const secret = true\n')
    await index.applyWatchEvents([{ type: 'created', path: 'ignored/secret.ts' }])

    expect(index.get('ignored')).toMatchObject({
      gitIgnored: true,
      type: 'directory',
    })
    expect(index.get('ignored/secret.ts')).toBeUndefined()
    expect(index.status()).toMatchObject({ readiness: 'ready' })
  })

  it('indexes a missing parent directory from a leaf create event', async () => {
    const root = await fixtureRoot()
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(path.join(root, 'src', 'app.ts'), 'export const app = true\n')
    await index.applyWatchEvents([{ type: 'created', path: 'src/app.ts' }])

    expect(index.get('src')).toMatchObject({ type: 'directory' })
    expect(index.get('src/app.ts')).toMatchObject({ type: 'file' })
  })

  it('refreshes default-ignored roots from child events without indexing children', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'ignored default\n')
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    expect(index.get('node_modules')).toMatchObject({
      defaultIgnored: true,
      type: 'directory',
    })
    expect(index.get('node_modules/pkg/index.js')).toBeUndefined()

    await rm(path.join(root, 'node_modules'), { recursive: true, force: true })
    await index.applyWatchEvents([{ type: 'deleted', path: 'node_modules' }])
    expect(index.get('node_modules')).toBeUndefined()

    await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), 'ignored again\n')
    await index.refresh('node_modules/pkg/index.js')

    expect(index.get('node_modules')).toMatchObject({
      defaultIgnored: true,
      type: 'directory',
    })
    expect(index.get('node_modules/pkg/index.js')).toBeUndefined()
  })

  it('rebuilds when root gitignore changes', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'ignored'), { recursive: true })
    await writeFile(path.join(root, '.gitignore'), '')
    await writeFile(path.join(root, 'ignored', 'secret.ts'), 'export const secret = true\n')
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))

    expect(index.get('ignored/secret.ts')).toMatchObject({ type: 'file' })

    await writeFile(path.join(root, '.gitignore'), 'ignored/\n')
    await index.applyWatchEvents([{ type: 'changed', path: '.gitignore' }])

    expect(index.status()).toMatchObject({
      readiness: 'ready',
      rebuildReason: 'gitignore-change',
    })
    expect(index.get('ignored')).toMatchObject({
      gitIgnored: true,
      type: 'directory',
    })
    expect(index.get('ignored/secret.ts')).toBeUndefined()
  })

  it('coalesces watch stream events before applying incremental updates', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))
    const events = controlledWatchEvents()
    const subscription = watchWorkspaceIndex(index, events.stream, { coalesceMs: 1 })

    try {
      await writeFile(path.join(root, 'src', 'a.ts'), 'export const a = true\n')
      await writeFile(path.join(root, 'src', 'b.ts'), 'export const b = true\n')
      events.push({ type: 'created', path: 'src/a.ts' })
      events.push({ type: 'created', path: 'src/b.ts' })

      expect(await waitForEntry(index, 'src/a.ts')).toMatchObject({ type: 'file' })
      expect(await waitForEntry(index, 'src/b.ts')).toMatchObject({ type: 'file' })
      expect(index.status().lastIncrementalUpdateAtMs).toEqual(expect.any(Number))
    } finally {
      await subscription.close()
    }
  })

  it('rebuilds when coalesced event count exceeds the limit', async () => {
    const root = await fixtureRoot()
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))
    const events = controlledWatchEvents()
    const subscription = watchWorkspaceIndex(index, events.stream, {
      coalesceMs: 10_000,
      rebuildEventLimit: 2,
    })

    try {
      await writeFile(path.join(root, 'rebuilt.ts'), 'export const rebuilt = true\n')
      events.push({ type: 'created', path: 'missing-a.ts' })
      events.push({ type: 'created', path: 'missing-b.ts' })

      const status = await waitForCompletedRebuild(index, 'watch-event-limit')

      expect(status).toMatchObject({
        readiness: 'ready',
        rebuildReason: 'watch-event-limit',
      })
      expect(index.get('rebuilt.ts')).toMatchObject({ type: 'file' })
    } finally {
      await subscription.close()
    }
  })

  it('collapses ignored child event bursts before applying the rebuild limit', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'node_modules'), { recursive: true })
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))
    const previousUpdate = index.status().lastIncrementalUpdateAtMs ?? 0
    const events = controlledWatchEvents()
    const subscription = watchWorkspaceIndex(index, events.stream, {
      coalesceMs: 1,
      rebuildEventLimit: 2,
    })

    try {
      await mkdir(path.join(root, 'node_modules', 'pkg-a'), { recursive: true })
      await mkdir(path.join(root, 'node_modules', 'pkg-b'), { recursive: true })
      events.push({ type: 'created', path: 'node_modules/pkg-a/index.js' })
      events.push({ type: 'created', path: 'node_modules/pkg-b/index.js' })

      const status = await waitForIncrementalUpdateAfter(index, previousUpdate)

      expect(status.rebuildReason).not.toBe('watch-event-limit')
      expect(index.get('node_modules')).toMatchObject({
        defaultIgnored: true,
        type: 'directory',
      })
      expect(index.get('node_modules/pkg-a/index.js')).toBeUndefined()
      expect(index.get('node_modules/pkg-b/index.js')).toBeUndefined()
    } finally {
      await subscription.close()
    }
  })

  it('marks affected subtrees stale while events are coalescing', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src', 'nested'), { recursive: true })
    await writeFile(path.join(root, 'src', 'a.ts'), 'export const a = true\n')
    await writeFile(path.join(root, 'src', 'nested', 'b.ts'), 'export const b = true\n')
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))
    const events = controlledWatchEvents()
    const subscription = watchWorkspaceIndex(index, events.stream, { coalesceMs: 10_000 })

    try {
      events.push({ type: 'changed', path: 'src' })
      const status = await waitForStatus(index, 'stale')

      expect(index.get('src')).toMatchObject({ stale: true })
      expect(index.get('src/a.ts')).toMatchObject({ stale: true })
      expect(index.get('src/nested/b.ts')).toMatchObject({ stale: true })
      expect(status.staleEntryCount).toBeGreaterThanOrEqual(4)
    } finally {
      await subscription.close()
    }
  })

  it('marks ready status stale while missing create events are coalescing', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'src'), { recursive: true })
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))
    const events = controlledWatchEvents()
    const subscription = watchWorkspaceIndex(index, events.stream, { coalesceMs: 10_000 })

    try {
      events.push({ type: 'created', path: 'src/new.ts' })
      const status = await waitForStatus(index, 'stale')

      expect(status.pendingCreatedPathCount).toBe(1)
      expect(status.staleEntryCount).toBe(0)
      expect(index.get('src/new.ts')).toBeUndefined()
    } finally {
      await subscription.close()
    }
  })

  it('rebuilds and marks the live index failed after watcher errors', async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, 'indexed.ts'), 'export const indexed = true\n')
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))
    const events = controlledWatchEvents()
    const subscription = watchWorkspaceIndex(index, events.stream, { coalesceMs: 1 })

    try {
      await writeFile(path.join(root, 'late.ts'), 'export const late = true\n')
      events.push({
        code: 'WATCH_FAILED',
        message: 'watch failed',
        type: 'error',
      })

      const status = await waitForStatus(index, 'failed')

      expect(index.get('indexed.ts')).toMatchObject({ type: 'file' })
      expect(index.get('late.ts')).toMatchObject({ type: 'file' })
      expect(status.errorMessage).toBe('watch failed')
      expect(index.status()).toMatchObject({
        readiness: 'failed',
        rebuildReason: 'watch-error',
      })
    } finally {
      await subscription.close()
    }
  })

  it('marks the live index failed after terminal watch stream errors', async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, 'indexed.ts'), 'export const indexed = true\n')
    const index = await buildWorkspaceIndex(createWorkspacePaths(root))
    const subscription = watchWorkspaceIndex(index, throwingWatchEvents)

    try {
      const status = await waitForStatus(index, 'failed')

      expect(index.get('indexed.ts')).toMatchObject({ type: 'file' })
      expect(status.errorMessage).toBe('stream failed')
      expect(status.rebuildReason).toBe('watch-stream-error')
    } finally {
      await subscription.close()
    }
  })
})

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-workspace-index-'))
  roots.push(root)
  return root
}

function requireEntry<T>(entry: T | undefined): T {
  if (entry) return entry

  throw new Error('Expected workspace index entry')
}

function controlledWatchEvents() {
  const queue: WatchServerMessage[] = []
  let wake: (() => void) | undefined

  return {
    push(event: WatchServerMessage) {
      queue.push(event)
      wake?.()
    },
    stream(signal: AbortSignal) {
      return streamControlledEvents(queue, signal, {
        readWake: () => wake,
        writeWake: (nextWake) => {
          wake = nextWake
        },
      })
    },
  }
}

async function* streamControlledEvents(
  queue: WatchServerMessage[],
  signal: AbortSignal,
  wake: {
    readWake(): (() => void) | undefined
    writeWake(nextWake: (() => void) | undefined): void
  },
) {
  while (!signal.aborted) {
    const event = queue.shift()
    if (event) {
      yield event
      continue
    }

    await waitForControlledEvent(signal, wake)
  }
}

function waitForControlledEvent(
  signal: AbortSignal,
  wake: {
    readWake(): (() => void) | undefined
    writeWake(nextWake: (() => void) | undefined): void
  },
) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      signal.removeEventListener('abort', finish)
      if (wake.readWake() === finish) wake.writeWake(undefined)
      resolve()
    }

    wake.writeWake(finish)
    signal.addEventListener('abort', finish, { once: true })
  })
}

// Rebuilds and watcher flushes have no completion signal to await, so tests
// poll. The deadline is generous because the suite shares the machine with
// other suites in CI; the helpers return as soon as the condition holds.
async function waitFor<T>(check: () => T | undefined, message: string) {
  const deadline = Date.now() + 5_000

  do {
    const value = check()
    if (value !== undefined) return value

    await delay(5)
  } while (Date.now() < deadline)

  throw new Error(message)
}

function waitForEntry(index: WorkspaceIndex, path: string) {
  return waitFor(() => index.get(path), `Expected workspace index entry for ${path}`)
}

function waitForMissingEntry(index: WorkspaceIndex, path: string) {
  return waitFor(
    () => (index.get(path) ? undefined : true),
    `Expected workspace index entry ${path} to be removed`,
  )
}

function waitForStatus(
  index: WorkspaceIndex,
  readiness: ReturnType<WorkspaceIndex['status']>['readiness'],
) {
  return waitFor(() => {
    const status = index.status()
    return status.readiness === readiness ? status : undefined
  }, `Expected workspace index status ${readiness}`)
}

function waitForCompletedRebuild(index: WorkspaceIndex, reason: string) {
  return waitFor(() => {
    const status = index.status()
    if (status.rebuildReason !== reason) return undefined
    if (status.readiness !== 'ready') return undefined

    return status
  }, `Expected workspace index to finish a rebuild for ${reason}`)
}

function waitForIncrementalUpdateAfter(index: WorkspaceIndex, previousUpdate: number) {
  return waitFor(() => {
    const status = index.status()
    const updatedAt = status.lastIncrementalUpdateAtMs ?? 0
    if (updatedAt > previousUpdate) return status
    // Fail fast when the watch-event limit fires: callers assert the reason,
    // so returning the wrong-path status beats waiting out the deadline.
    if (status.rebuildReason === 'watch-event-limit') return status

    return undefined
  }, 'Expected workspace index incremental update')
}

function throwingWatchEvents(): AsyncIterable<WatchServerMessage> {
  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<WatchServerMessage>> {
          throw new Error('stream failed')
        },
      }
    },
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
