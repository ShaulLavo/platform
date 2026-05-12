import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, mock } from "bun:test"

import {
  DiskWorkspaceSearchProvider,
  findInWorkspace,
  findInWorkspaceStream,
} from "./search"
import { createWorkspacePaths } from "./path"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("workspace disk search provider", () => {
  it("finds filename and content matches by default with disk source metadata", async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, "src"), { recursive: true })
    await writeFile(
      path.join(root, "src", "button.ts"),
      "export const Button = 1"
    )
    await writeFile(path.join(root, "src", "other.ts"), "button content")

    const result = await findInWorkspace(createWorkspacePaths(root), {
      includeContent: true,
      limit: 20,
      maxContentBytes: 1_000_000,
      path: "",
      query: "button",
    })

    expect(result.matches).toContainEqual(
      expect.objectContaining({
        kind: "name",
        path: "src/button.ts",
        source: "disk",
      })
    )
    expect(result.matches).toContainEqual(
      expect.objectContaining({
        column: 1,
        endColumn: 7,
        kind: "content",
        path: "src/other.ts",
        source: "disk",
      })
    )
  })

  it("can search content without returning filename matches", async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, "src"), { recursive: true })
    await writeFile(path.join(root, "src", "needle-name.ts"), "no match here")
    await writeFile(path.join(root, "src", "content.ts"), "needle content")

    const result = await findInWorkspace(createWorkspacePaths(root), {
      includeContent: true,
      includeNames: false,
      limit: 20,
      maxContentBytes: 1_000_000,
      path: "",
      query: "needle",
    })

    expect(result.matches).toEqual([
      expect.objectContaining({
        kind: "content",
        path: "src/content.ts",
        source: "disk",
      }),
    ])
  })

  it("emits exact content ranges for each match on a line", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "many.ts"), "needle and needle")

    const result = await findInWorkspace(createWorkspacePaths(root), {
      includeContent: true,
      limit: 20,
      maxContentBytes: 1_000_000,
      path: "",
      query: "needle",
    })

    const contentMatches = result.matches.filter(
      (match) => match.kind === "content" && match.path === "many.ts"
    )

    expect(contentMatches).toEqual([
      expect.objectContaining({ column: 1, endColumn: 7 }),
      expect.objectContaining({ column: 12, endColumn: 18 }),
    ])
  })

  it("keeps long-line previews anchored around the match", async () => {
    const root = await fixtureRoot()
    await writeFile(
      path.join(root, "long.ts"),
      `${"x".repeat(320)}needle${"y".repeat(20)}`
    )

    const result = await findInWorkspace(createWorkspacePaths(root), {
      includeContent: true,
      limit: 20,
      maxContentBytes: 1_000_000,
      path: "",
      query: "needle",
    })

    expect(result.matches).toContainEqual(
      expect.objectContaining({
        column: 321,
        endColumn: 327,
        preview: expect.stringContaining("needle"),
        previewStartColumn: expect.any(Number),
      })
    )
  })

  it("strips line terminators from content previews", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "line.ts"), "const needle = true\n")

    const result = await findInWorkspace(createWorkspacePaths(root), {
      includeContent: true,
      includeNames: false,
      limit: 20,
      maxContentBytes: 1_000_000,
      path: "",
      query: "needle",
    })
    const match = result.matches.find(
      (candidate) => candidate.kind === "content"
    )

    expect(match).toMatchObject({
      column: 7,
      endColumn: 13,
      path: "line.ts",
      preview: "const needle = true",
    })
  })

  it("respects case-sensitive content search", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "case.ts"), "needle Needle")

    const result = await findInWorkspace(createWorkspacePaths(root), {
      caseSensitive: true,
      includeContent: true,
      includeNames: false,
      limit: 20,
      maxContentBytes: 1_000_000,
      path: "",
      query: "needle",
    })

    expect(result.matches).toEqual([
      expect.objectContaining({
        column: 1,
        endColumn: 7,
        path: "case.ts",
      }),
    ])
  })

  it("supports regex content search", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "regex.ts"), "needle useful unused")

    const result = await findInWorkspace(createWorkspacePaths(root), {
      includeContent: true,
      includeNames: false,
      limit: 20,
      matchMode: "regex",
      maxContentBytes: 1_000_000,
      path: "",
      query: "usef\\w+",
    })

    expect(result.matches).toEqual([
      expect.objectContaining({
        column: 8,
        endColumn: 14,
        path: "regex.ts",
      }),
    ])
  })

  it("supports whole-word content search", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "words.ts"), "needle needleness xneedle")

    const result = await findInWorkspace(createWorkspacePaths(root), {
      includeContent: true,
      includeNames: false,
      limit: 20,
      maxContentBytes: 1_000_000,
      path: "",
      query: "needle",
      wholeWord: true,
    })

    expect(result.matches).toEqual([
      expect.objectContaining({
        column: 1,
        endColumn: 7,
        path: "words.ts",
      }),
    ])
  })

  it("filters content search with include and exclude globs", async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, "src"), { recursive: true })
    await mkdir(path.join(root, "tests"), { recursive: true })
    await writeFile(path.join(root, "src", "match.ts"), "needle")
    await writeFile(path.join(root, "src", "skip.test.ts"), "needle")
    await writeFile(path.join(root, "tests", "match.ts"), "needle")

    const result = await findInWorkspace(createWorkspacePaths(root), {
      excludeGlobs: ["*.test.ts"],
      includeContent: true,
      includeGlobs: ["src/*.ts"],
      includeNames: false,
      limit: 20,
      maxContentBytes: 1_000_000,
      path: "",
      query: "needle",
    })

    expect(result.matches).toEqual([
      expect.objectContaining({
        path: "src/match.ts",
      }),
    ])
  })

  it("keeps partial rg results when ripgrep exits with a nonfatal filesystem error", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "match.txt"), "needle")
    await symlink(".", path.join(root, "loop"))

    const result = await findInWorkspace(createWorkspacePaths(root), {
      includeContent: true,
      limit: 20,
      maxContentBytes: 1_000_000,
      path: "",
      query: "needle",
    })

    expect(result.matches).toContainEqual(
      expect.objectContaining({
        kind: "content",
        path: "match.txt",
      })
    )
  })

  it("does not ask ripgrep to follow broken symlinks in nested ignored directories", async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, "apps/web/node_modules/pkg"), {
      recursive: true,
    })
    await mkdir(path.join(root, "src"), { recursive: true })
    await writeFile(path.join(root, "src/match.txt"), "needle")
    await symlink(
      path.join(root, "apps/web/node_modules/missing"),
      path.join(root, "apps/web/node_modules/pkg/broken")
    )
    const originalWarn = console.warn
    console.warn = mock()

    try {
      const result = await findInWorkspace(createWorkspacePaths(root), {
        includeContent: true,
        limit: 20,
        maxContentBytes: 1_000_000,
        path: "",
        query: "needle",
      })

      expect(result.matches).toContainEqual(
        expect.objectContaining({
          kind: "content",
          path: "src/match.txt",
        })
      )
      expect(console.warn).not.toHaveBeenCalled()
    } finally {
      console.warn = originalWarn
    }
  })

  it("reports truncation when the limit is reached", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "alpha.txt"), "needle")
    await writeFile(path.join(root, "beta.txt"), "needle")

    const events = await collectEvents(
      findInWorkspaceStream(createWorkspacePaths(root), {
        includeContent: false,
        limit: 1,
        maxContentBytes: 1_000_000,
        path: "",
        query: "txt",
      })
    )
    const done = events.find((event) => event.type === "done")

    expect(done).toMatchObject({ count: 1, truncated: true })
  })

  it("returns no events when aborted before search starts", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "alpha.txt"), "needle")
    const controller = new AbortController()
    controller.abort()
    const provider = new DiskWorkspaceSearchProvider(createWorkspacePaths(root))

    const events = await collectEvents(
      provider.search(
        {
          includeContent: true,
          limit: 20,
          maxContentBytes: 1_000_000,
          path: "",
          query: "needle",
        },
        controller.signal
      )
    )

    expect(events).toEqual([])
  })
})

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "platform-search-"))
  roots.push(root)
  return root
}

async function collectEvents<T>(events: AsyncIterable<T>) {
  const result: T[] = []
  for await (const event of events) result.push(event)

  return result
}
