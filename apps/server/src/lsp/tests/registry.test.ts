import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { pinnedLspRuntimeManifest, type PinnedLspRuntimeManifestEntry } from '../installer-manifest'
import {
  bestLspMatchForFeature,
  lspServersFor,
  matchLspServers,
  resolveLspServer,
} from '../registry'

const NO_OVERRIDES = { servers: {}, tyForPython: false } as const

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('LSP server registry', () => {
  it('exposes the full built-in server set', () => {
    const ids = lspServersFor(NO_OVERRIDES)
      .map((server) => server.id)
      .toSorted()

    expect(ids).toEqual(
      [
        'astro',
        'bash',
        'biome',
        'clangd',
        'clojure-lsp',
        'csharp',
        'dart',
        'deno',
        'dockerfile',
        'elixir-ls',
        'eslint',
        'fsharp',
        'gleam',
        'gopls',
        'haskell-language-server',
        'jdtls',
        'julials',
        'kotlin-ls',
        'lua-ls',
        'nixd',
        'ocaml-lsp',
        'oxlint',
        'php intelephense',
        'prisma',
        'pyright',
        'ruby-lsp',
        'rust',
        'sourcekit-lsp',
        'svelte',
        'terraform',
        'texlab',
        'tinymist',
        'typescript',
        'vue',
        'yaml-ls',
        'zls',
      ].toSorted(),
    )
  })

  it('switches python support to ty when enabled', () => {
    const ids = lspServersFor({ servers: {}, tyForPython: true }).map((server) => server.id)

    expect(ids).toContain('ty')
    expect(ids).not.toContain('pyright')
  })

  it('matches TypeScript files to the nearest package root', async () => {
    const root = await fixtureRoot({
      'package.json': '{}',
      'src/index.ts': 'export const value = 1\n',
    })

    const matches = await matchLspServers({
      settings: NO_OVERRIDES,
      filePath: path.join(root, 'src/index.ts'),
      workspaceRoot: root,
    })

    expect(matches.map((match) => match.server.id)).toEqual([
      'typescript',
      'eslint',
      'oxlint',
      'biome',
    ])
    expect(matches.every((match) => match.root === root)).toBe(true)
  })

  it('uses the compatible server-owned TypeScript when the project has no tsserver entrypoint', async () => {
    const root = await fixtureRoot({
      'package.json': '{}',
    })
    const typescript = lspServersFor(NO_OVERRIDES).find((server) => server.id === 'typescript')
    const expectedPath = path.resolve(
      import.meta.dirname,
      '../../../node_modules/typescript-language-service/lib/tsserver.js',
    )

    await expect(typescript?.initializationOptions?.(root)).resolves.toEqual({
      tsserver: { path: expectedPath },
    })
  })

  it('prefers a project TypeScript server entrypoint when one exists', async () => {
    const root = await fixtureRoot({
      'node_modules/typescript/lib/tsserver.js': 'module.exports = {}\n',
      'package.json': '{}',
    })
    const typescript = lspServersFor(NO_OVERRIDES).find((server) => server.id === 'typescript')

    await expect(typescript?.initializationOptions?.(root)).resolves.toEqual({
      tsserver: { path: path.join(root, 'node_modules/typescript/lib/tsserver.js') },
    })
  })

  it('prefers deno for TypeScript files inside a Deno project', async () => {
    const root = await fixtureRoot({
      'deno.json': '{}',
      'src/index.ts': 'export const value = 1\n',
    })

    const matches = await matchLspServers({
      settings: NO_OVERRIDES,
      filePath: path.join(root, 'src/index.ts'),
      workspaceRoot: root,
    })

    expect(matches[0]).toMatchObject({
      root,
      server: { id: 'deno' },
    })
  })

  it('returns null for unknown file extensions', async () => {
    const root = await fixtureRoot({
      'notes.custom': 'custom\n',
    })

    const matches = await matchLspServers({
      settings: NO_OVERRIDES,
      filePath: path.join(root, 'notes.custom'),
      workspaceRoot: root,
    })

    expect(matches).toEqual([])
  })

  it('orders feature owners by rank, then server priority and id', async () => {
    const root = await fixtureRoot({
      'package.json': '{}',
      'src/index.ts': 'export const value = 1\n',
    })
    const matches = await matchLspServers({
      settings: NO_OVERRIDES,
      filePath: path.join(root, 'src/index.ts'),
      workspaceRoot: root,
    })

    expect(bestLspMatchForFeature(matches, 'completion')?.server.id).toBe('typescript')
    expect(bestLspMatchForFeature(matches, 'diagnostics')?.server.id).toBe('eslint')
    expect(bestLspMatchForFeature(matches, 'formatting')?.server.id).toBe('eslint')
  })

  it('applies numeric feature ranks and null exclusions', () => {
    const servers = lspServersFor({
      servers: {
        typescript: { disabled: false, features: { completion: 5, semanticTokens: null } },
      },
      tyForPython: false,
    })
    const typescript = servers.find((server) => server.id === 'typescript')

    expect(typescript?.features?.completion).toBe(5)
    expect(typescript?.features?.semanticTokens).toBeUndefined()
  })

  it('resolves only the requested eligible server for explicit transport', async () => {
    const root = await fixtureRoot({
      'package.json': '{}',
      'src/index.ts': 'export const value = 1\n',
    })

    const match = await resolveLspServer({
      settings: NO_OVERRIDES,
      filePath: path.join(root, 'src/index.ts'),
      serverId: 'biome',
      workspaceRoot: root,
    })
    const unknown = await resolveLspServer({
      settings: NO_OVERRIDES,
      filePath: path.join(root, 'src/index.ts'),
      serverId: 'unknown',
      workspaceRoot: root,
    })

    expect(match?.server.id).toBe('biome')
    expect(unknown).toBeNull()
  })

  it('keeps Biome eligible for JSON and JSONC', async () => {
    const root = await fixtureRoot({
      'biome.json': '{}',
      'data.json': '{}',
      'data.jsonc': '{}',
    })

    for (const file of ['data.json', 'data.jsonc']) {
      const matches = await matchLspServers({
        settings: NO_OVERRIDES,
        filePath: path.join(root, file),
        workspaceRoot: root,
      })
      expect(matches.map((match) => match.server.id)).toContain('biome')
    }
  })

  it('applies per-server overrides from settings', () => {
    const servers = lspServersFor({
      servers: {
        'custom-lsp': {
          command: ['custom-lsp-server', '--stdio'],
          disabled: false,
          extensions: ['.custom'],
        },
        typescript: { disabled: true },
      },
      tyForPython: false,
    })

    expect(servers.some((server) => server.id === 'typescript')).toBe(false)
    expect(servers).toContainEqual(
      expect.objectContaining({
        extensions: ['.custom'],
        id: 'custom-lsp',
      }),
    )
  })

  it('turns ty off again through the setting, whatever the old env var says', () => {
    // The bug this replaces: `truthy(process.env.FS_EXPERIMENTAL_LSP_TY)` was
    // snapshotted at module load and ORed into every call, so the flag could be
    // turned on and never off, and this suite passed only on machines that did
    // not export it.
    process.env.FS_EXPERIMENTAL_LSP_TY = 'true'
    try {
      const on = lspServersFor({ servers: {}, tyForPython: true }).map((server) => server.id)
      const off = lspServersFor({ servers: {}, tyForPython: false }).map((server) => server.id)

      expect(on).toContain('ty')
      expect(on).not.toContain('pyright')
      expect(off).toContain('pyright')
      expect(off).not.toContain('ty')
    } finally {
      delete process.env.FS_EXPERIMENTAL_LSP_TY
    }
  })

  it('pins runtime release downloads with checksums', () => {
    const manifest: Record<string, PinnedLspRuntimeManifestEntry> = pinnedLspRuntimeManifest
    for (const entry of Object.values(manifest)) {
      for (const platform of Object.values(entry.platforms)) {
        if (!platform) continue

        for (const asset of Object.values(platform)) {
          if (!asset) continue

          expect(asset.url).toContain(`/releases/download/${entry.version}/`)
          expect(asset.url).not.toContain('/latest')
          expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u)
        }
      }
    }
  })
})

async function fixtureRoot(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-lsp-'))
  roots.push(root)

  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }

  return root
}
