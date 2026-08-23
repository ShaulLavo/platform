import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { closeTestApps, createTestApp } from '../../../test/server'
import { testSettingsOptions } from '../../settings/testing'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const roots: string[] = []

afterEach(async () => {
  await closeTestApps()
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })))
})

describe('filesystem recents', () => {
  it('records and returns picked files, folders, and their symlinks', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'folder'))
    await writeFile(path.join(root, 'file.ts'), 'export {}\n')
    await symlink('file.ts', path.join(root, 'linked.ts'))
    const app = testApp(root)

    for (const recentPath of ['folder', 'file.ts', 'linked.ts']) {
      const response = await recordRecent(app, recentPath)
      expect(response.status).toBe(200)
    }

    const response = await recentEntries(app, { limit: 10, mode: 'file', showHidden: true })
    const payload = (await response.json()) as {
      entries: Array<{ path: string; targetType?: string; type: string }>
    }

    expect(response.status).toBe(200)
    expect(payload.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'folder', type: 'directory' }),
        expect.objectContaining({ path: 'file.ts', type: 'file' }),
        expect.objectContaining({ path: 'linked.ts', targetType: 'file', type: 'symlink' }),
      ]),
    )
  })

  it('rejects unpickable and out-of-workspace paths', async () => {
    const root = await fixtureRoot()
    await symlink('missing.ts', path.join(root, 'broken.ts'))
    const app = testApp(root)

    const broken = await recordRecent(app, 'broken.ts')
    const outside = await recordRecent(app, '../outside')

    expect(broken.status).toBe(400)
    expect(await errorCode(broken)).toBe('INVALID_PATH')
    expect(outside.status).toBe(403)
    expect(await errorCode(outside)).toBe('PATH_OUTSIDE_WORKSPACE')
  })

  it('backfills past hidden and stale rows before applying the requested limit', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, 'visible'))
    await mkdir(path.join(root, 'stale'))
    const hiddenPaths = Array.from({ length: 51 }, (_, index) => `.hidden-${index}`)
    await Promise.all(hiddenPaths.map((entry) => mkdir(path.join(root, entry))))
    const app = testApp(root)

    expect((await recordRecent(app, 'visible')).status).toBe(200)
    expect((await recordRecent(app, 'stale')).status).toBe(200)
    await rm(path.join(root, 'stale'), { recursive: true })
    for (const hiddenPath of hiddenPaths) {
      expect((await recordRecent(app, hiddenPath)).status).toBe(200)
    }

    const response = await recentEntries(app, {
      limit: 1,
      mode: 'folder',
      showHidden: false,
    })
    const payload = (await response.json()) as { entries: Array<{ path: string }> }

    expect(response.status).toBe(200)
    expect(payload.entries).toEqual([expect.objectContaining({ path: 'visible' })])
  })

  it('filters folder mode by effective type and can include hidden entries', async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, '.hidden-folder'))
    await mkdir(path.join(root, 'folder'))
    await writeFile(path.join(root, 'file.ts'), 'export {}\n')
    await symlink('folder', path.join(root, 'linked-folder'))
    await symlink('file.ts', path.join(root, 'linked-file.ts'))
    const app = testApp(root)

    for (const recentPath of ['.hidden-folder', 'linked-file.ts', 'linked-folder', 'file.ts']) {
      expect((await recordRecent(app, recentPath)).status).toBe(200)
    }

    const response = await recentEntries(app, {
      limit: 10,
      mode: 'folder',
      showHidden: true,
    })
    const payload = (await response.json()) as {
      entries: Array<{ path: string; targetType?: string; type: string }>
    }

    expect(response.status).toBe(200)
    expect(payload.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '.hidden-folder', type: 'directory' }),
        expect.objectContaining({
          path: 'linked-folder',
          targetType: 'directory',
          type: 'symlink',
        }),
      ]),
    )
    expect(payload.entries.map((entry) => entry.path)).not.toContain('file.ts')
    expect(payload.entries.map((entry) => entry.path)).not.toContain('linked-file.ts')
  })
})

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-recents-'))
  roots.push(root)
  return root
}

function testApp(root: string) {
  return createTestApp({
    auth: { allowedOrigins: [TRUSTED_ORIGIN] },
    settings: testSettingsOptions(root),
    watch: false,
    workspaceRoot: root,
  })
}

function recordRecent(app: ReturnType<typeof createTestApp>, recentPath: string) {
  return app.handle(
    new Request('http://local/fs/recents', {
      body: JSON.stringify({ path: recentPath }),
      headers: trustedOriginHeaders({ 'content-type': 'application/json' }),
      method: 'POST',
    }),
  )
}

function recentEntries(
  app: ReturnType<typeof createTestApp>,
  query: { limit: number; mode: 'file' | 'folder'; showHidden: boolean },
) {
  const search = new URLSearchParams({
    limit: String(query.limit),
    mode: query.mode,
    showHidden: String(query.showHidden),
  })

  return app.handle(
    new Request(`http://local/fs/recents?${search}`, { headers: trustedOriginHeaders() }),
  )
}

function trustedOriginHeaders(headers: HeadersInit = {}) {
  return { ...headers, origin: TRUSTED_ORIGIN }
}

async function errorCode(response: Response) {
  const payload = (await response.json()) as { error?: { code?: string } }
  return payload.error?.code
}
