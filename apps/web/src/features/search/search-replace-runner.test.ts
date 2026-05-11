import { createDocumentSession } from "@editor/core"
import { describe, expect, it } from "bun:test"
import type {
  WorkspaceSearchMatch,
  WorkspaceSearchQuery,
} from "@workspace/contracts"

import type { CachedEditorDocument } from "@/features/editor/state/editor-document-state"
import type { FileResult, TreeEntry } from "@/lib/file-system-types"
import {
  replaceWorkspaceSearchMatches,
  workspaceSearchReplaceSummary,
  type WorkspaceSearchReplaceContext,
} from "./search-replace-runner"

const QUERY: WorkspaceSearchQuery = {
  includeContent: true,
  limit: 20,
  path: "repo",
  query: "needle",
}

describe("workspace search replacement runner", () => {
  it("applies replacements to cached editor memory and marks it dirty", async () => {
    const document = cachedDocument("repo/src/app.ts", "needle")
    const dirtyPaths: string[] = []
    const result = await replaceWorkspaceSearchMatches({
      context: testContext({
        documents: { [document.path]: document },
        onDirty: (path) => dirtyPaths.push(path),
      }),
      matches: [match({ path: document.path })],
      query: QUERY,
      replaceText: "pin",
    })

    expect(document.session.getText()).toBe("pin")
    expect(document.session.isDirty()).toBe(true)
    expect(dirtyPaths).toEqual([document.path])
    expect(result).toEqual({
      changedFiles: 1,
      failedFiles: 0,
      replacedMatches: 1,
      skippedMatches: 0,
    })
  })

  it("writes uncached files with an mtime guard and caches the saved result", async () => {
    const cachedFiles: FileResult[] = []
    const writes: Array<{ content: string; expectedMtimeMs?: number | null }> =
      []
    const result = await replaceWorkspaceSearchMatches({
      context: testContext({
        files: {
          "repo/src/app.ts": fileResult("repo/src/app.ts", "needle"),
        },
        onCacheFile: (file) => cachedFiles.push(file),
        onWrite: (_path, content, expectedMtimeMs) => {
          writes.push({ content, expectedMtimeMs })
          return { mtimeMs: 200, size: content.length }
        },
      }),
      matches: [match({ path: "repo/src/app.ts" })],
      query: QUERY,
      replaceText: "pin",
    })

    expect(writes).toEqual([{ content: "pin", expectedMtimeMs: 100 }])
    expect(cachedFiles).toEqual([
      expect.objectContaining({
        content: "pin",
        mtimeMs: 200,
        path: "repo/src/app.ts",
        size: 3,
      }),
    ])
    expect(result.replacedMatches).toBe(1)
  })

  it("reports failed uncached writes as skipped file matches", async () => {
    const result = await replaceWorkspaceSearchMatches({
      context: testContext({
        files: {
          "repo/src/app.ts": fileResult("repo/src/app.ts", "needle"),
        },
        onWrite: () => {
          throw new Error("changed")
        },
      }),
      matches: [match({ path: "repo/src/app.ts" })],
      query: QUERY,
      replaceText: "pin",
    })

    expect(result).toEqual({
      changedFiles: 0,
      failedFiles: 1,
      replacedMatches: 0,
      skippedMatches: 1,
    })
  })

  it("summarizes partial replace results", () => {
    expect(
      workspaceSearchReplaceSummary({
        changedFiles: 1,
        failedFiles: 1,
        replacedMatches: 2,
        skippedMatches: 3,
      })
    ).toBe("2 matches replaced, 3 skipped, 1 file failed.")
  })
})

function testContext({
  documents = {},
  files = {},
  onCacheFile = () => {},
  onDirty = () => {},
  onWrite = (_path, content) => ({ mtimeMs: 101, size: content.length }),
}: {
  documents?: Record<string, CachedEditorDocument>
  files?: Record<string, FileResult>
  onCacheFile?: (file: FileResult) => void
  onDirty?: (path: string) => void
  onWrite?: (
    path: string,
    content: string,
    expectedMtimeMs?: number | null
  ) => Pick<TreeEntry, "mtimeMs" | "size">
}): WorkspaceSearchReplaceContext {
  return {
    cacheFile: onCacheFile,
    fetchFile: async (path) => files[path] ?? missingFile(path),
    getCachedEditorDocument: (path) => documents[path] ?? null,
    recordCachedEditorDocumentTextChange: onDirty,
    signal: new AbortController().signal,
    writeFileContent: async (path, content, expectedMtimeMs) =>
      onWrite(path, content, expectedMtimeMs),
  }
}

function cachedDocument(path: string, text: string): CachedEditorDocument {
  const session = createDocumentSession(text)
  session.markClean()

  return {
    path,
    revision: 100,
    session,
  }
}

function fileResult(path: string, content: string): FileResult {
  return {
    content,
    mtimeMs: 100,
    path,
    size: content.length,
  }
}

function missingFile(path: string): FileResult {
  throw new Error(`${path} missing`)
}

function match({ path }: { path: string }): WorkspaceSearchMatch {
  return {
    column: 1,
    endColumn: 7,
    kind: "content",
    line: 1,
    path,
    source: "disk",
    type: "file",
  }
}
