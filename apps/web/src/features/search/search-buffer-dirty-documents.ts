import type { LiveEditorDocument } from '@/features/editor/state/editor-document-state'
import type { OpenBufferSearchDocument } from '@/features/search/search-providers'
import { compareSearchPaths } from '@/features/search/search-sort'

export function dirtySearchDocuments(
  documents: Readonly<Record<string, LiveEditorDocument>>,
  dirtyFilePaths: ReadonlySet<string>,
  rootPath: string,
) {
  const dirtyDocuments: OpenBufferSearchDocument[] = []

  for (const path of dirtyFilePaths) {
    if (!isPathInWorkspace(path, rootPath)) continue

    const document = documents[path]
    if (!document) continue

    dirtyDocuments.push({
      path,
      text: document.buffer.materializeFullText(),
    })
  }

  return dirtyDocuments.sort((a, b) => compareSearchPaths(a.path, b.path))
}

export function dirtySearchRevisionKey(
  documents: Readonly<Record<string, LiveEditorDocument>>,
  dirtyFilePaths: ReadonlySet<string>,
  contentRevisions: Readonly<Record<string, string>>,
  rootPath: string,
) {
  const parts: string[] = []
  const paths = Array.from(dirtyFilePaths)
    .filter((path) => isPathInWorkspace(path, rootPath))
    .toSorted(compareSearchPaths)

  for (const path of paths) {
    const document = documents[path]
    if (!document) {
      parts.push(path, '', '', '')
      continue
    }

    parts.push(
      path,
      liveDocumentSnapshotRevision(document),
      contentRevisions[path] ?? '',
      dirtySearchBufferKey(document.buffer),
    )
  }

  return parts.join('\0')
}

const dirtySearchBufferKeys = new WeakMap<LiveEditorDocument['buffer'], number>()
let nextDirtySearchBufferKey = 1

function dirtySearchBufferKey(buffer: LiveEditorDocument['buffer']) {
  const existing = dirtySearchBufferKeys.get(buffer)
  if (existing !== undefined) return existing.toString()

  const key = nextDirtySearchBufferKey
  nextDirtySearchBufferKey += 1
  dirtySearchBufferKeys.set(buffer, key)
  return key.toString()
}

function liveDocumentSnapshotRevision(document: LiveEditorDocument) {
  if (document.sync.kind === 'file') return document.sync.mtimeMs.toString()

  return document.localRevision.toString()
}

function isPathInWorkspace(path: string, rootPath: string) {
  if (!rootPath) return true
  if (path === rootPath) return true

  return path.startsWith(`${rootPath}/`)
}
