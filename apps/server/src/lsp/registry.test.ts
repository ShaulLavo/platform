import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "bun:test"

import {
  pinnedLspRuntimeManifest,
  type PinnedLspRuntimeManifestEntry,
} from "./installer-manifest"
import { lspServersForEnvironment, matchLspServer } from "./registry"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("LSP server registry", () => {
  it("exposes the full built-in server set", () => {
    const ids = lspServersForEnvironment()
      .map((server) => server.id)
      .toSorted()

    expect(ids).toEqual(
      [
        "astro",
        "bash",
        "biome",
        "clangd",
        "clojure-lsp",
        "csharp",
        "dart",
        "deno",
        "dockerfile",
        "elixir-ls",
        "eslint",
        "fsharp",
        "gleam",
        "gopls",
        "haskell-language-server",
        "jdtls",
        "julials",
        "kotlin-ls",
        "lua-ls",
        "nixd",
        "ocaml-lsp",
        "oxlint",
        "php intelephense",
        "prisma",
        "pyright",
        "ruby-lsp",
        "rust",
        "sourcekit-lsp",
        "svelte",
        "terraform",
        "texlab",
        "tinymist",
        "typescript",
        "vue",
        "yaml-ls",
        "zls",
      ].toSorted()
    )
  })

  it("switches python support to ty when enabled", () => {
    const ids = lspServersForEnvironment({
      FS_EXPERIMENTAL_LSP_TY: "true",
    }).map((server) => server.id)

    expect(ids).toContain("ty")
    expect(ids).not.toContain("pyright")
  })

  it("matches TypeScript files to the nearest package root", async () => {
    const root = await fixtureRoot({
      "package.json": "{}",
      "src/index.ts": "export const value = 1\n",
    })

    const match = await matchLspServer({
      filePath: path.join(root, "src/index.ts"),
      workspaceRoot: root,
    })

    expect(match).toMatchObject({
      root,
      server: { id: "typescript" },
    })
  })

  it("prefers deno for TypeScript files inside a Deno project", async () => {
    const root = await fixtureRoot({
      "deno.json": "{}",
      "src/index.ts": "export const value = 1\n",
    })

    const match = await matchLspServer({
      filePath: path.join(root, "src/index.ts"),
      workspaceRoot: root,
    })

    expect(match).toMatchObject({
      root,
      server: { id: "deno" },
    })
  })

  it("returns null for unknown file extensions", async () => {
    const root = await fixtureRoot({
      "notes.custom": "custom\n",
    })

    const match = await matchLspServer({
      filePath: path.join(root, "notes.custom"),
      workspaceRoot: root,
    })

    expect(match).toBeNull()
  })

  it("loads custom server definitions from PLATFORM_LSP_CONFIG", () => {
    const servers = lspServersForEnvironment({
      PLATFORM_LSP_CONFIG: JSON.stringify({
        "custom-lsp": {
          command: ["custom-lsp-server", "--stdio"],
          extensions: [".custom"],
        },
        typescript: {
          disabled: true,
        },
      }),
    })

    expect(servers.some((server) => server.id === "typescript")).toBe(false)
    expect(servers).toContainEqual(
      expect.objectContaining({
        extensions: [".custom"],
        id: "custom-lsp",
      })
    )
  })

  it("pins runtime release downloads with checksums", () => {
    const manifest: Record<string, PinnedLspRuntimeManifestEntry> =
      pinnedLspRuntimeManifest
    for (const entry of Object.values(manifest)) {
      for (const platform of Object.values(entry.platforms)) {
        if (!platform) continue

        for (const asset of Object.values(platform)) {
          if (!asset) continue

          expect(asset.url).toContain(`/releases/download/${entry.version}/`)
          expect(asset.url).not.toContain("/latest")
          expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/u)
        }
      }
    }
  })
})

async function fixtureRoot(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), "platform-lsp-"))
  roots.push(root)

  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }

  return root
}
