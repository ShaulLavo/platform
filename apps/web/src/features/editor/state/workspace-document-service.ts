import { createClientInvariantError } from '@/lib/structured-errors'

import {
  contentRevisionForText,
  textSnapshotEqualsText,
} from '@/features/editor/utils/text-snapshot'
import type { FileResult } from '@/lib/file-system-types'
import {
  createEditorTextBuffer,
  createEditorViewSession,
  type EditorScrollPosition,
  type EditorTextBuffer,
  type EditorViewSession,
} from '@singapor/core'

export type LiveDocumentSyncState = 'idle' | 'saving' | 'conflict'

export type LiveDocumentSync =
  | {
      fileVersion: string
      kind: 'file'
      mtimeMs: number
      path: string
      state: LiveDocumentSyncState
    }
  | {
      kind: 'none'
    }

export type LiveEditorDocument = {
  buffer: EditorTextBuffer
  contentRevision: string
  id: string
  localRevision: number
  path: string
  sync: LiveDocumentSync
}

export type EditorDocumentView = {
  documentId: string
  scrollPosition?: EditorScrollPosition
  tabId: string
  view: EditorViewSession
}

export type LiveEditorViewDocument = LiveEditorDocument & {
  scrollPosition?: EditorScrollPosition
  tabId: string
  view: EditorViewSession
}

export type UnsyncedLiveEditorDocumentInput = {
  content: string
  id: string
}

export type WorkspaceDocumentServiceState = {
  documentContentRevisions: Readonly<Record<string, string>>
  dirtyContentRevision: number
  dirtyFilePaths: ReadonlySet<string>
  liveDocumentsById: Readonly<Record<string, LiveEditorDocument>>
  scrollPositionByTabId: Readonly<Record<string, EditorScrollPosition>>
  viewsByTabId: Readonly<Record<string, EditorDocumentView>>
}

type LiveEditorDocumentRecord = {
  buffer: EditorTextBuffer
  contentRevision: string
  id: string
  localRevision: number
  path: string
  sync: LiveDocumentSync
}

type EditorDocumentViewRecord = {
  documentId: string
  scrollPosition?: EditorScrollPosition
  tabId: string
  view: EditorViewSession
}

export class WorkspaceDocumentService {
  private readonly documentContentRevisions = new Map<string, string>()
  private readonly dirtyFilePaths = new Set<string>()
  private dirtyContentRevision = 0
  private readonly liveDocumentsById = new Map<string, LiveEditorDocumentRecord>()
  private readonly viewsByTabId = new Map<string, EditorDocumentViewRecord>()

  clear(): void {
    this.documentContentRevisions.clear()
    this.dirtyFilePaths.clear()
    this.dirtyContentRevision = 0
    this.liveDocumentsById.clear()
    this.viewsByTabId.clear()
  }

  deleteLiveDocument(documentId: string): { hadLiveDocument: boolean; wasDirty: boolean } {
    const document = this.liveDocumentsById.get(documentId)
    const path = document?.path ?? documentId
    const wasDirty = this.isDirtyDocumentId(documentId)
    const hadLiveDocument = this.liveDocumentsById.delete(documentId)

    this.dirtyFilePaths.delete(path)
    this.documentContentRevisions.delete(documentId)

    for (const [tabId, view] of this.viewsByTabId) {
      if (view.documentId !== documentId) continue

      this.viewsByTabId.delete(tabId)
    }

    return { hadLiveDocument, wasDirty }
  }

  ensureLiveDocument(file: FileResult): LiveEditorDocument {
    const existing = this.liveDocumentsById.get(file.path)
    if (existing?.buffer.isDirty()) return this.liveDocumentProjection(existing)
    if (existing && fileSyncVersion(existing) === file.version) {
      return this.liveDocumentProjection(existing)
    }

    const record = this.createFileDocumentRecord(file)
    this.liveDocumentsById.set(file.path, record)
    this.documentContentRevisions.set(file.path, record.contentRevision)
    this.dirtyFilePaths.delete(file.path)
    this.rebindViewsForDocument(file.path)
    return this.liveDocumentProjection(record)
  }

  ensureView(tabId: string, file: FileResult): LiveEditorViewDocument {
    const document = this.ensureLiveDocument(file)
    return this.ensureViewForDocument(tabId, document.id)
  }

  ensureUnsyncedDocument(input: UnsyncedLiveEditorDocumentInput): LiveEditorDocument {
    const existing = this.liveDocumentsById.get(input.id)
    if (existing?.buffer.isDirty()) return this.liveDocumentProjection(existing)
    if (existing && textSnapshotEqualsText(existing.buffer.getTextSnapshot(), input.content)) {
      return this.liveDocumentProjection(existing)
    }

    const record = this.createUnsyncedDocumentRecord(input)
    this.liveDocumentsById.set(input.id, record)
    this.documentContentRevisions.set(input.id, record.contentRevision)
    this.rebindViewsForDocument(input.id)
    return this.liveDocumentProjection(record)
  }

  ensureViewForDocument(tabId: string, documentId: string): LiveEditorViewDocument {
    const document = this.getRequiredLiveDocument(documentId)
    const existing = this.viewsByTabId.get(tabId)
    if (existing?.documentId === document.id) {
      return this.viewDocumentProjection(existing)
    }

    const view = createEditorViewSession(document.buffer, `tab:${tabId}`)
    view.setScrollPosition(existing?.scrollPosition)
    this.viewsByTabId.set(tabId, {
      documentId: document.id,
      scrollPosition: existing?.scrollPosition,
      tabId,
      view,
    })
    const nextView = this.viewsByTabId.get(tabId)
    if (!nextView) throw createClientInvariantError('editor view was not created')

    return this.viewDocumentProjection(nextView)
  }

  evictCleanLiveDocument(documentId: string): boolean {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) return false
    if (document.buffer.isDirty()) return false

    this.deleteLiveDocument(documentId)
    return true
  }

  evictCleanUnviewedLiveDocument(documentId: string): boolean {
    if (this.hasViewsForDocument(documentId)) return false

    return this.evictCleanLiveDocument(documentId)
  }

  removeView(tabId: string): boolean {
    const view = this.viewsByTabId.get(tabId)
    if (!view) return false

    this.viewsByTabId.delete(tabId)
    return true
  }

  forceReplaceLiveDocument(file: FileResult): { changed: boolean; wasDirty: boolean } {
    const wasDirty = this.isDirtyDocumentId(file.path)
    const existing = this.liveDocumentsById.get(file.path)
    if (existing && !wasDirty && fileSyncVersion(existing) === file.version) {
      if (textSnapshotEqualsText(existing.buffer.getTextSnapshot(), file.content)) {
        return { changed: false, wasDirty: false }
      }
    }

    const record = this.replacementRecord(file, existing)

    this.liveDocumentsById.set(file.path, record)
    this.documentContentRevisions.set(file.path, record.contentRevision)
    this.dirtyFilePaths.delete(file.path)
    this.rebindViewsForDocument(file.path)
    return { changed: true, wasDirty }
  }

  getLiveDocument(documentId: string): LiveEditorDocument | null {
    const record = this.liveDocumentsById.get(documentId)
    if (!record) return null

    return this.liveDocumentProjection(record)
  }

  getView(tabId: string): EditorDocumentView | null {
    const record = this.viewsByTabId.get(tabId)
    if (!record) return null

    return this.viewProjection(record)
  }

  getViewDocument(tabId: string): LiveEditorViewDocument | null {
    const record = this.viewsByTabId.get(tabId)
    if (!record) return null

    return this.viewDocumentProjection(record)
  }

  hasLiveDocument(documentId: string): boolean {
    return this.liveDocumentsById.has(documentId)
  }

  markSaved({
    fileVersion,
    documentId,
    mtimeMs,
    savedContentRevision,
    savedText,
  }: {
    fileVersion: string
    documentId: string
    mtimeMs: number
    savedContentRevision: string
    savedText: string
  }): boolean {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) return false
    if (document.sync.kind !== 'file') return false

    document.sync.mtimeMs = mtimeMs
    document.sync.fileVersion = fileVersion
    document.sync.state = 'idle'
    if (document.contentRevision !== savedContentRevision) return false
    if (!textSnapshotEqualsText(document.buffer.getTextSnapshot(), savedText)) return false

    document.buffer.markClean()
    document.localRevision = document.buffer.getRevision()
    this.dirtyFilePaths.delete(document.path)
    return true
  }

  recordTextChange(documentId: string): void {
    this.dirtyContentRevision += 1
    const contentRevision = editedContentRevision(this.dirtyContentRevision)
    const document = this.liveDocumentsById.get(documentId)
    if (document) {
      document.contentRevision = contentRevision
      document.localRevision = document.buffer.getRevision()
      this.documentContentRevisions.set(documentId, contentRevision)
      this.dirtyFilePaths.add(document.path)
      return
    }

    this.dirtyFilePaths.add(documentId)
  }

  renameLiveDocument(from: string, to: string): { wasDirty: boolean } {
    const wasDirty = this.isDirtyDocumentId(from)
    const document = this.liveDocumentsById.get(from)
    const contentRevision = this.documentContentRevisions.get(from)

    this.liveDocumentsById.delete(from)
    this.documentContentRevisions.delete(from)
    this.renameDirtyPath(from, to)

    if (contentRevision !== undefined) this.documentContentRevisions.set(to, contentRevision)
    if (document) {
      document.id = to
      document.path = to
      if (document.sync.kind === 'file') document.sync.path = to
      this.liveDocumentsById.set(to, document)
    }

    for (const view of this.viewsByTabId.values()) {
      if (view.documentId === from) view.documentId = to
    }

    return { wasDirty }
  }

  setDirty(documentId: string, dirty: boolean): void {
    const path = this.liveDocumentsById.get(documentId)?.path ?? documentId
    if (dirty) {
      this.dirtyFilePaths.add(path)
      return
    }

    this.dirtyFilePaths.delete(path)
  }

  setViewScrollPosition(tabId: string, scrollPosition: EditorScrollPosition): boolean {
    const view = this.viewsByTabId.get(tabId)
    if (!view) return false
    if (scrollPositionsEqual(view.scrollPosition, scrollPosition)) return false

    view.scrollPosition = scrollPosition
    view.view.setScrollPosition(scrollPosition)
    return true
  }

  state(): WorkspaceDocumentServiceState {
    return {
      documentContentRevisions: Object.fromEntries(this.documentContentRevisions),
      dirtyContentRevision: this.dirtyContentRevision,
      dirtyFilePaths: new Set(this.dirtyFilePaths),
      liveDocumentsById: Object.fromEntries(
        Array.from(this.liveDocumentsById, ([documentId, document]) => [
          documentId,
          this.liveDocumentProjection(document),
        ]),
      ),
      scrollPositionByTabId: Object.fromEntries(
        Array.from(this.viewsByTabId)
          .filter(([, view]) => view.scrollPosition !== undefined)
          .map(([tabId, view]) => [tabId, view.scrollPosition!]),
      ),
      viewsByTabId: Object.fromEntries(
        Array.from(this.viewsByTabId, ([tabId, view]) => [tabId, this.viewProjection(view)]),
      ),
    }
  }

  private createFileDocumentRecord(file: FileResult): LiveEditorDocumentRecord {
    const buffer = createEditorTextBuffer(file.content)
    buffer.markClean()

    return {
      buffer,
      contentRevision: contentRevisionForText(file.content),
      id: file.path,
      localRevision: buffer.getRevision(),
      path: file.path,
      sync: {
        fileVersion: file.version,
        kind: 'file',
        mtimeMs: file.mtimeMs,
        path: file.path,
        state: 'idle',
      },
    }
  }

  private createUnsyncedDocumentRecord(
    input: UnsyncedLiveEditorDocumentInput,
  ): LiveEditorDocumentRecord {
    const buffer = createEditorTextBuffer(input.content)
    buffer.markClean()

    return {
      buffer,
      contentRevision: contentRevisionForText(input.content),
      id: input.id,
      localRevision: buffer.getRevision(),
      path: input.id,
      sync: { kind: 'none' },
    }
  }

  private replacementRecord(
    file: FileResult,
    existing: LiveEditorDocumentRecord | undefined,
  ): LiveEditorDocumentRecord {
    if (!existing) return this.createFileDocumentRecord(file)
    if (!textSnapshotEqualsText(existing.buffer.getTextSnapshot(), file.content)) {
      return this.createFileDocumentRecord(file)
    }

    existing.buffer.markClean()
    existing.localRevision = existing.buffer.getRevision()
    existing.contentRevision = contentRevisionForText(file.content)
    existing.sync = {
      fileVersion: file.version,
      kind: 'file',
      mtimeMs: file.mtimeMs,
      path: file.path,
      state: 'idle',
    }
    return existing
  }

  private rebindViewsForDocument(documentId: string): void {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) return

    for (const [tabId, view] of this.viewsByTabId) {
      if (view.documentId !== documentId) continue

      const nextView = createEditorViewSession(document.buffer, `tab:${tabId}`)
      nextView.setScrollPosition(view.scrollPosition)
      this.viewsByTabId.set(tabId, {
        ...view,
        view: nextView,
      })
    }
  }

  private liveDocumentProjection(document: LiveEditorDocumentRecord): LiveEditorDocument {
    return {
      buffer: document.buffer,
      contentRevision: document.contentRevision,
      id: document.id,
      localRevision: document.localRevision,
      path: document.path,
      sync: syncProjection(document.sync),
    }
  }

  private viewProjection(view: EditorDocumentViewRecord): EditorDocumentView {
    return {
      documentId: view.documentId,
      scrollPosition: view.scrollPosition,
      tabId: view.tabId,
      view: view.view,
    }
  }

  private viewDocumentProjection(view: EditorDocumentViewRecord): LiveEditorViewDocument {
    const document = this.getRequiredLiveDocument(view.documentId)

    return {
      ...this.liveDocumentProjection(document),
      scrollPosition: view.scrollPosition,
      tabId: view.tabId,
      view: view.view,
    }
  }

  private getRequiredLiveDocument(documentId: string): LiveEditorDocumentRecord {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) {
      throw createClientInvariantError(`Missing live document ${documentId}`)
    }

    return document
  }

  private hasViewsForDocument(documentId: string): boolean {
    for (const view of this.viewsByTabId.values()) {
      if (view.documentId === documentId) return true
    }

    return false
  }

  private isDirtyDocumentId(documentId: string): boolean {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) return this.dirtyFilePaths.has(documentId)
    if (this.dirtyFilePaths.has(document.path)) return true

    return document.buffer.isDirty()
  }

  private renameDirtyPath(from: string, to: string): void {
    const wasDirty = this.dirtyFilePaths.delete(from)
    if (wasDirty) this.dirtyFilePaths.add(to)
  }
}

function editedContentRevision(revision: number) {
  return `e:${revision.toString(36)}`
}

function scrollPositionsEqual(
  current: EditorScrollPosition | undefined,
  next: EditorScrollPosition,
) {
  if (!current) return false

  return current.left === next.left && current.top === next.top
}

function fileSyncVersion(document: LiveEditorDocumentRecord | undefined) {
  if (!document) return null
  if (document.sync.kind !== 'file') return null

  return document.sync.fileVersion
}

function syncProjection(sync: LiveDocumentSync): LiveDocumentSync {
  if (sync.kind === 'none') return { kind: 'none' }

  return { ...sync }
}
