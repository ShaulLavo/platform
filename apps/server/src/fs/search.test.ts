import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "bun:test"

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
  it("finds filename and content matches with disk source metadata", async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, "src"), { recursive: true })
    await writeFile(path.join(root, "src", "button.ts"), "export const Button = 1")
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
