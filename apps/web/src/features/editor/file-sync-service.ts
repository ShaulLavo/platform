import type {
  CachedEditorDocument,
  EditorDocumentStoreApi,
} from '@/features/editor/state/editor-document-state'
import { setFileContentQueryData } from '@/lib/file-query-cache'
import {
  writeFileContent,
  type WriteFileContentOptions,
} from '@/lib/file-server'
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

  async save(document: CachedEditorDocument): Promise<FileResult> {
    const text = document.session.materializeFullText()
    const savedContentRevision = document.contentRevision
    const writeId = createWriteId()
    const entry = await this.writeContent(document.path, text, {
      baseVersion: document.fileVersion,
      expectedMtimeMs: document.revision,
      origin: 'editor',
      writeId,
    })
    const file = fileResultForSavedDocument(document.path, text, entry)

    this.documentStore.getState().markCachedEditorDocumentSaved({
      fileVersion: entry.version,
      path: document.path,
      revision: entry.mtimeMs,
      savedContentRevision,
      savedText: text,
    })
    setFileContentQueryData(this.queryClient, file)
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
