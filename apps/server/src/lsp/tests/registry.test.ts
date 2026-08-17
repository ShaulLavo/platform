import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { pinnedLspRuntimeManifest, type PinnedLspRuntimeManifestEntry } from '../installer-manifest'
import { lspServersFor, matchLspServer } from '../registry'

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

    const match = await matchLspServer({
      settings: NO_OVERRIDES,
      filePath: path.join(root, 'src/index.ts'),
      workspaceRoot: root,
    })

    expect(match).toMatchObject({
      root,
      server: { id: 'typescript' },
    })
  })

  it('prefers deno for TypeScript files inside a Deno project', async () => {
    const root = await fixtureRoot({
      'deno.json': '{}',
      'src/index.ts': 'export const value = 1\n',
    })

    const match = await matchLspServer({
      settings: NO_OVERRIDES,
      filePath: path.join(root, 'src/index.ts'),
      workspaceRoot: root,
    })

    expect(match).toMatchObject({
      root,
      server: { id: 'deno' },
    })
  })

  it('returns null for unknown file extensions', async () => {
    const root = await fixtureRoot({
      'notes.custom': 'custom\n',
    })

    const match = await matchLspServer({
      settings: NO_OVERRIDES,
      filePath: path.join(root, 'notes.custom'),
      workspaceRoot: root,
    })

    expect(match).toBeNull()
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
