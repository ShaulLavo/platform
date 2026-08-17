import { createEditorTextBuffer } from '@singapor/core'
import { describe, expect, it } from 'vitest'
import type { WorkspaceSearchMatch, WorkspaceSearchQuery } from '@workspace/contracts'

import type { LiveEditorDocument } from '@/features/editor/state/document-state'
import type { FileResult, TreeEntry } from '@/lib/file-system-types'
import {
  replaceWorkspaceSearchMatches,
  workspaceSearchReplaceSummary,
  type WorkspaceSearchReplaceContext,
} from '@/features/search/utils/replace-runner'

const QUERY: WorkspaceSearchQuery = {
  includeContent: true,
  limit: 20,
  path: 'repo',
  query: 'needle',
}

describe('workspace search replacement runner', () => {
  it('applies replacements to live editor memory and marks it dirty', async () => {
    const document = liveDocument('repo/src/app.ts', 'needle')
    const dirtyPaths: string[] = []
    const result = await replaceWorkspaceSearchMatches({
      context: testContext({
        documents: { [document.path]: document },
        onDirty: (path) => dirtyPaths.push(path),
      }),
      matches: [match({ path: document.path })],
      query: QUERY,
      replaceText: 'pin',
    })

    expect(
      document.buffer.getTextSnapshot().readRange(0, document.buffer.getSnapshot().length),
    ).toBe('pin')
    expect(document.buffer.isDirty()).toBe(true)
    expect(dirtyPaths).toEqual([document.path])
    expect(result).toEqual({
      changedFiles: 1,
      failedFiles: 0,
      replacedMatches: 1,
      skippedMatches: 0,
    })
  })

  it('writes disk files with an mtime guard and caches the saved snapshot', async () => {
    const snapshotFiles: FileResult[] = []
    const writes: Array<{
      baseVersion?: string | null
      content: string
      expectedMtimeMs?: number | null
    }> = []
    const result = await replaceWorkspaceSearchMatches({
      context: testContext({
        files: {
          'repo/src/app.ts': fileResult('repo/src/app.ts', 'needle'),
        },
        onCacheFile: (file) => snapshotFiles.push(file),
        onWrite: (_path, content, options) => {
          writes.push({
            baseVersion: options?.baseVersion,
            content,
            expectedMtimeMs: options?.expectedMtimeMs,
          })
          return { mtimeMs: 200, size: content.length, version: 'test:200:3' }
        },
      }),
      matches: [match({ path: 'repo/src/app.ts' })],
      query: QUERY,
      replaceText: 'pin',
    })

    expect(writes).toEqual([{ baseVersion: 'test:100:6', content: 'pin', expectedMtimeMs: 100 }])
    expect(snapshotFiles).toEqual([
      expect.objectContaining({
        content: 'pin',
        mtimeMs: 200,
        path: 'repo/src/app.ts',
        size: 3,
        version: 'test:200:3',
      }),
    ])
    expect(result.replacedMatches).toBe(1)
  })

  it('reports failed disk writes as skipped file matches', async () => {
    const result = await replaceWorkspaceSearchMatches({
      context: testContext({
        files: {
          'repo/src/app.ts': fileResult('repo/src/app.ts', 'needle'),
        },
        onWrite: () => {
          throw new Error('changed')
        },
      }),
      matches: [match({ path: 'repo/src/app.ts' })],
      query: QUERY,
      replaceText: 'pin',
    })

    expect(result).toEqual({
      changedFiles: 0,
      failedFiles: 1,
      replacedMatches: 0,
      skippedMatches: 1,
    })
  })

  it('summarizes partial replace results', () => {
    expect(
      workspaceSearchReplaceSummary({
        changedFiles: 1,
        failedFiles: 1,
        replacedMatches: 2,
        skippedMatches: 3,
      }),
    ).toBe('2 matches replaced, 3 skipped, 1 file failed.')
  })
})

function testContext({
  documents = {},
  files = {},
  onCacheFile = () => {},
  onDirty = () => {},
  onWrite = (_path, content) => ({
    mtimeMs: 101,
    size: content.length,
    version: `test:101:${content.length}`,
  }),
}: {
  documents?: Record<string, LiveEditorDocument>
  files?: Record<string, FileResult>
  onCacheFile?: (file: FileResult) => void
  onDirty?: (path: string) => void
  onWrite?: (
    path: string,
    content: string,
    options?: { baseVersion?: string | null; expectedMtimeMs?: number | null },
  ) => Pick<TreeEntry, 'mtimeMs' | 'size' | 'version'>
}): WorkspaceSearchReplaceContext {
  return {
    cacheFile: onCacheFile,
    fetchFile: async (path) => files[path] ?? missingFile(path),
    getLiveEditorDocument: (path) => documents[path] ?? null,
    recordLiveEditorDocumentTextChange: onDirty,
    signal: new AbortController().signal,
    writeFileContent: async (path, content, options) => onWrite(path, content, options),
  }
}

function liveDocument(path: string, text: string): LiveEditorDocument {
  const buffer = createEditorTextBuffer(text)
  buffer.markClean()

  return {
    buffer,
    contentRevision: 'h:test',
    id: path,
    localRevision: buffer.getRevision(),
    path,
    sync: {
      fileVersion: 'test:100',
      kind: 'file',
      mtimeMs: 100,
      path,
      state: 'idle',
    },
  }
}

function fileResult(path: string, content: string): FileResult {
  return {
    content,
    mtimeMs: 100,
    path,
    size: content.length,
    version: `test:100:${content.length}`,
  }
}

function missingFile(path: string): FileResult {
  throw new Error(`${path} missing`)
}

function match({ path }: { path: string }): WorkspaceSearchMatch {
  return {
    column: 1,
    endColumn: 7,
    kind: 'content',
    line: 1,
    path,
    source: 'disk',
    type: 'file',
  }
}
