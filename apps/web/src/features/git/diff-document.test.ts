import { describe, expect, it } from "bun:test"
import {
  diffDocumentId,
  diffDocumentLabel,
  diffDocumentTitle,
  parseDiffDocumentId,
} from "./diff-document"
import type { FileDiff } from "./types"

describe("git diff document ids", () => {
  it("round-trips snapshot diff documents", () => {
    const diff: FileDiff = {
      hunks: [],
      newObjectId: "b".repeat(40),
      oldObjectId: "a".repeat(40),
      oldPath: "/repo/src/old.ts",
      patch: "",
      path: "/repo/src/new.ts",
      staged: false,
    }

    const id = diffDocumentId(diff)

    expect(parseDiffDocumentId(id)).toEqual({
      id,
      kind: "snapshot",
      path: "/repo/src/new.ts",
      query: {
        newObjectId: "b".repeat(40),
        oldObjectId: "a".repeat(40),
        oldPath: "/repo/src/old.ts",
        path: "/repo/src/new.ts",
      },
    })
    expect(diffDocumentLabel(id)).toBe("new.ts (diff)")
    expect(diffDocumentTitle(id)).toBe("/repo/src/new.ts (diff)")
  })

  it("parses legacy staged and worktree diff documents", () => {
    const staged = diffDocumentId("/repo/src/app.ts", true)
    const worktree = diffDocumentId("/repo/src/app.ts", false)

    expect(parseDiffDocumentId(staged)).toMatchObject({
      kind: "legacy",
      path: "/repo/src/app.ts",
      staged: true,
    })
    expect(parseDiffDocumentId(worktree)).toMatchObject({
      kind: "legacy",
      path: "/repo/src/app.ts",
      staged: false,
    })
  })
})
