import { createEditorDocumentStore } from '@/features/editor/state/editor-document-state'
import { FileSyncService, type FileSyncWriteFileContent } from '@/features/editor/file-sync-service'
import type { FileResult, TreeEntry } from '@/lib/file-system-types'
import { fileSystemKeys } from '@/lib/query-keys'
import { createEditorBufferSession } from '@editor/core'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

describe('FileSyncService', () => {
  it('saves with a base file version and marks unchanged saved buffers clean', async () => {
    const store = createEditorDocumentStore()
    const queryClient = new QueryClient()
    const document = store.getState().ensureLiveEditorDocument(file('src/app.ts', 'old', 100))
    createEditorBufferSession(document.buffer).applyText('!')
    store.getState().recordLiveEditorDocumentTextChange(document.path)
    const writes: Array<{ content: string; options: Parameters<FileSyncWriteFileContent>[2] }> = []

    await new FileSyncService(store, queryClient, async (path, content, options) => {
      writes.push({ content, options })
      return entry(path, content, 200)
    }).save(store.getState().getLiveEditorDocument(document.path)!)

    const saved = store.getState().getLiveEditorDocument(document.path)!
    expect(writes).toEqual([
      {
        content: 'old!',
        options: expect.objectContaining({
          baseVersion: 'test:100:3',
          expectedMtimeMs: 100,
          origin: 'editor',
          writeId: expect.stringMatching(/^editor:/),
        }),
      },
    ])
    expect(saved.sync.kind).toBe('file')
    if (saved.sync.kind !== 'file') throw new Error('expected file sync metadata')
    expect(saved.sync.fileVersion).toBe('test:200:4')
    expect(saved.sync.mtimeMs).toBe(200)
    expect(saved.buffer.isDirty()).toBe(false)
    expect(store.getState().dirtyFilePaths.has(document.path)).toBe(false)
    expect(queryClient.getQueryData(fileSystemKeys.fileSnapshot(document.path))).toEqual(
      file('src/app.ts', 'old!', 200),
    )
  })

  it('keeps the document dirty when edits land during an in-flight save', async () => {
    const store = createEditorDocumentStore()
    const queryClient = new QueryClient()
    const document = store.getState().ensureLiveEditorDocument(file('src/app.ts', 'old', 100))
    createEditorBufferSession(document.buffer).applyText('!')
    store.getState().recordLiveEditorDocumentTextChange(document.path)
    const savingDocument = store.getState().getLiveEditorDocument(document.path)!

    await new FileSyncService(store, queryClient, async (path, content) => {
      const latest = store.getState().getLiveEditorDocument(path)!
      createEditorBufferSession(latest.buffer).applyText('?')
      store.getState().recordLiveEditorDocumentTextChange(path)
      return entry(path, content, 200)
    }).save(savingDocument)

    const afterSave = store.getState().getLiveEditorDocument(document.path)!
    expect(afterSave.buffer.materializeFullText()).toBe('old!?')
    expect(afterSave.sync.kind).toBe('file')
    if (afterSave.sync.kind !== 'file') throw new Error('expected file sync metadata')
    expect(afterSave.sync.fileVersion).toBe('test:200:4')
    expect(afterSave.sync.mtimeMs).toBe(200)
    expect(afterSave.buffer.isDirty()).toBe(true)
    expect(store.getState().dirtyFilePaths.has(document.path)).toBe(true)
    expect(queryClient.getQueryData(fileSystemKeys.fileSnapshot(document.path))).toEqual(
      file('src/app.ts', 'old!', 200),
    )
  })
})

function file(path: string, content: string, mtimeMs: number): FileResult {
  return {
    content,
    mtimeMs,
    path,
    size: content.length,
    version: `test:${mtimeMs}:${content.length}`,
  }
}

function entry(path: string, content: string, mtimeMs: number): TreeEntry {
  return {
    birthtimeMs: mtimeMs,
    mtimeMs,
    name: path.split('/').at(-1) ?? path,
    path,
    size: content.length,
    type: 'file',
    version: `test:${mtimeMs}:${content.length}`,
  }
}
