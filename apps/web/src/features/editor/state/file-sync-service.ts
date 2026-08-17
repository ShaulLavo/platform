import { createClientInvariantError } from '@/lib/structured-errors'

import type {
  LiveEditorDocument,
  EditorDocumentStoreApi,
} from '@/features/editor/state/document-state'
import { setFileSnapshotQueryData } from '@/lib/file-snapshot-query-cache'
import { writeFileContent, type WriteFileContentOptions } from '@/lib/file-server'
import type { FileResult, TreeEntry } from '@/lib/file-system-types'
import type { QueryClient } from '@tanstack/react-query'

export type FileSyncWriteFileContent = (
  path: string,
  content: string,
  options?: WriteFileContentOptions,
) => Promise<TreeEntry>

export class FileSyncService {
  constructor(
    private readonly documentStore: EditorDocumentStoreApi,
    private readonly queryClient: QueryClient,
    private readonly writeContent: FileSyncWriteFileContent = writeFileContent,
  ) {}

  async save(document: LiveEditorDocument): Promise<FileResult> {
    if (document.sync.kind !== 'file') {
      throw createClientInvariantError(`Cannot save unsynced editor document ${document.id}`)
    }

    const sync = document.sync
    const text = document.buffer.materializeFullText()
    const savedContentRevision = document.contentRevision
    const writeId = createWriteId()
    const entry = await this.writeContent(sync.path, text, {
      baseVersion: sync.fileVersion,
      expectedMtimeMs: sync.mtimeMs,
      origin: 'editor',
      writeId,
    })
    const file = fileResultForSavedDocument(sync.path, text, entry)

    this.documentStore.getState().markLiveEditorDocumentSaved({
      documentId: document.id,
      fileVersion: entry.version,
      mtimeMs: entry.mtimeMs,
      savedContentRevision,
      savedText: text,
    })
    setFileSnapshotQueryData(this.queryClient, file)
    return file
  }
}

function fileResultForSavedDocument(path: string, content: string, entry: TreeEntry): FileResult {
  return {
    content,
    mtimeMs: entry.mtimeMs,
    path,
    size: entry.size,
    version: entry.version,
  }
}

function createWriteId() {
  if (globalThis.crypto?.randomUUID) return `editor:${globalThis.crypto.randomUUID()}`

  return `editor:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`
}
