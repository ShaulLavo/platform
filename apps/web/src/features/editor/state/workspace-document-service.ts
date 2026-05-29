import {
  contentRevisionForText,
  contentRevisionForTextSnapshot,
  textSnapshotEqualsText,
} from '@/features/editor/utils/text-snapshot'
import type { FileResult } from '@/lib/file-system-types'
import {
  createEditorBufferSession,
  createEditorTextBuffer,
  createEditorViewSession,
  type DocumentSession,
  type EditorTextBuffer,
  type EditorViewSession,
  type EditorScrollPosition,
} from '@editor/core'

export type WorkspaceDocumentProjection = {
  contentRevision: string
  fileVersion: string
  path: string
  revision: number
  scrollPosition?: EditorScrollPosition
  session: DocumentSession
  buffer: EditorTextBuffer
  view: EditorViewSession
}

export type WorkspaceDocumentServiceState = {
  documentContentRevisions: Readonly<Record<string, string>>
  dirtyContentRevision: number
  dirtyFilePaths: ReadonlySet<string>
  documents: Readonly<Record<string, WorkspaceDocumentProjection>>
  scrollPositionByPath: Readonly<Record<string, EditorScrollPosition>>
  scrollPositionByTabId: Readonly<Record<string, EditorScrollPosition>>
  tabDocuments: Readonly<Record<string, WorkspaceDocumentProjection>>
}

type WorkspaceDocumentRecord = {
  buffer: EditorTextBuffer
  contentRevision: string
  fileVersion: string
  path: string
  revision: number
  scrollPosition?: EditorScrollPosition
  session: DocumentSession
  view: EditorViewSession
}

type WorkspaceDocumentViewRecord = {
  path: string
  scrollPosition?: EditorScrollPosition
  session: DocumentSession
  tabId: string
  view: EditorViewSession
}

export class WorkspaceDocumentService {
  private readonly documentContentRevisions = new Map<string, string>()
  private readonly documents = new Map<string, WorkspaceDocumentRecord>()
  private readonly dirtyFilePaths = new Set<string>()
  private readonly tabDocuments = new Map<string, WorkspaceDocumentViewRecord>()
  private dirtyContentRevision = 0

  clear(): void {
    this.documentContentRevisions.clear()
    this.documents.clear()
    this.dirtyFilePaths.clear()
    this.tabDocuments.clear()
    this.dirtyContentRevision = 0
  }

  deleteDocument(path: string): { hadCachedDocument: boolean; wasDirty: boolean } {
    const hadCachedDocument = this.documents.delete(path)
    const wasDirty = this.isDirtyPath(path)
    this.dirtyFilePaths.delete(path)
    this.documentContentRevisions.delete(path)

    for (const [tabId, view] of this.tabDocuments) {
      if (view.path !== path) continue

      this.tabDocuments.delete(tabId)
    }

    return { hadCachedDocument, wasDirty }
  }

  ensureDocument(file: FileResult): WorkspaceDocumentProjection {
    const cached = this.documents.get(file.path)
    if (cached?.buffer.isDirty()) return this.documentProjection(cached)
    if (cached?.fileVersion === file.version) return this.documentProjection(cached)

    const record = this.createDocumentRecord(file, cached?.scrollPosition)
    this.documents.set(file.path, record)
    this.documentContentRevisions.set(file.path, record.contentRevision)
    this.dirtyFilePaths.delete(file.path)
    this.rebindViewsForPath(file.path)
    return this.documentProjection(record)
  }

  ensureTabDocument(tabId: string, file: FileResult): WorkspaceDocumentProjection {
    const document = this.ensureDocument(file)
    const existing = this.tabDocuments.get(tabId)
    if (
      existing?.path === file.path &&
      existing.session.getSnapshot() === document.session.getSnapshot()
    ) {
      return this.tabProjection(existing)
    }

    const view = createEditorViewSession(document.buffer, `tab:${tabId}`)
    view.setScrollPosition(existing?.scrollPosition)
    const session = createEditorBufferSession(document.buffer, view)
    this.tabDocuments.set(tabId, {
      path: file.path,
      scrollPosition: existing?.scrollPosition,
      session,
      tabId,
      view,
    })
    return this.tabProjection(this.tabDocuments.get(tabId)!)
  }

  evictCleanDocument(path: string): boolean {
    const cached = this.documents.get(path)
    if (!cached) return false
    if (cached.buffer.isDirty()) return false

    this.deleteDocument(path)
    return true
  }

  evictCleanTabDocument(tabId: string): boolean {
    const cached = this.tabDocuments.get(tabId)
    if (!cached) return false
    if (this.documents.get(cached.path)?.buffer.isDirty()) return false

    this.tabDocuments.delete(tabId)
    return true
  }

  forceReplaceDocument(file: FileResult): { changed: boolean; wasDirty: boolean } {
    const wasDirty = this.isDirtyPath(file.path)
    const cached = this.documents.get(file.path)
    if (cached && !wasDirty && cached.fileVersion === file.version) {
      if (textSnapshotEqualsText(cached.buffer.getTextSnapshot(), file.content)) {
        return { changed: false, wasDirty: false }
      }
    }

    const record = this.replacementRecord(file, cached)

    this.documents.set(file.path, record)
    this.documentContentRevisions.set(file.path, record.contentRevision)
    this.dirtyFilePaths.delete(file.path)
    this.rebindViewsForPath(file.path)
    return { changed: true, wasDirty }
  }

  getDocument(path: string): WorkspaceDocumentProjection | null {
    const record = this.documents.get(path)
    if (!record) return null

    return this.documentProjection(record)
  }

  getTabDocument(tabId: string): WorkspaceDocumentProjection | null {
    const record = this.tabDocuments.get(tabId)
    if (!record) return null

    return this.tabProjection(record)
  }

  hasDocument(path: string): boolean {
    return this.documents.has(path)
  }

  markClean(path: string, revision: number, fileVersion?: string): boolean {
    const cached = this.documents.get(path)
    if (!cached) return false

    cached.buffer.markClean()
    cached.revision = revision
    if (fileVersion) cached.fileVersion = fileVersion
    cached.contentRevision = contentRevisionForTextSnapshot(cached.buffer.getTextSnapshot())
    this.documentContentRevisions.set(path, cached.contentRevision)
    this.dirtyFilePaths.delete(path)
    return true
  }

  markSaved({
    fileVersion,
    path,
    revision,
    savedContentRevision,
    savedText,
  }: {
    fileVersion: string
    path: string
    revision: number
    savedContentRevision: string
    savedText: string
  }): boolean {
    const cached = this.documents.get(path)
    if (!cached) return false

    cached.revision = revision
    cached.fileVersion = fileVersion
    if (cached.contentRevision !== savedContentRevision) return false
    if (!textSnapshotEqualsText(cached.buffer.getTextSnapshot(), savedText)) return false

    cached.buffer.markClean()
    this.dirtyFilePaths.delete(path)
    return true
  }

  recordTextChange(path: string): void {
    this.dirtyContentRevision += 1
    const contentRevision = editedContentRevision(this.dirtyContentRevision)
    const cached = this.documents.get(path)
    if (cached) {
      cached.contentRevision = contentRevision
      this.documentContentRevisions.set(path, contentRevision)
    }

    this.dirtyFilePaths.add(path)
  }

  renameDocument(from: string, to: string): { wasDirty: boolean } {
    const wasDirty = this.isDirtyPath(from)
    const cached = this.documents.get(from)
    const contentRevision = this.documentContentRevisions.get(from)

    this.documents.delete(from)
    this.documentContentRevisions.delete(from)
    this.renameDirtyPath(from, to)

    if (contentRevision !== undefined) this.documentContentRevisions.set(to, contentRevision)
    if (cached) {
      cached.path = to
      this.documents.set(to, cached)
    }

    for (const view of this.tabDocuments.values()) {
      if (view.path === from) view.path = to
    }

    return { wasDirty }
  }

  setDirty(path: string, dirty: boolean): void {
    if (dirty) {
      this.dirtyFilePaths.add(path)
      return
    }

    this.dirtyFilePaths.delete(path)
  }

  setDocumentScrollPosition(path: string, scrollPosition: EditorScrollPosition): boolean {
    const document = this.documents.get(path)
    if (!document) return false
    if (scrollPositionsEqual(document.scrollPosition, scrollPosition)) return false

    document.scrollPosition = scrollPosition
    document.view.setScrollPosition(scrollPosition)
    return true
  }

  setTabScrollPosition(tabId: string, scrollPosition: EditorScrollPosition): boolean {
    const document = this.tabDocuments.get(tabId)
    if (!document) return false
    if (scrollPositionsEqual(document.scrollPosition, scrollPosition)) return false

    document.scrollPosition = scrollPosition
    document.view.setScrollPosition(scrollPosition)
    return true
  }

  state(): WorkspaceDocumentServiceState {
    return {
      documentContentRevisions: Object.fromEntries(this.documentContentRevisions),
      dirtyContentRevision: this.dirtyContentRevision,
      dirtyFilePaths: new Set(this.dirtyFilePaths),
      documents: Object.fromEntries(
        Array.from(this.documents, ([path, document]) => [path, this.documentProjection(document)]),
      ),
      scrollPositionByPath: Object.fromEntries(
        Array.from(this.documents)
          .filter(([, document]) => document.scrollPosition !== undefined)
          .map(([path, document]) => [path, document.scrollPosition!]),
      ),
      scrollPositionByTabId: Object.fromEntries(
        Array.from(this.tabDocuments)
          .filter(([, document]) => document.scrollPosition !== undefined)
          .map(([tabId, document]) => [tabId, document.scrollPosition!]),
      ),
      tabDocuments: Object.fromEntries(
        Array.from(this.tabDocuments, ([tabId, document]) => [tabId, this.tabProjection(document)]),
      ),
    }
  }

  private createDocumentRecord(
    file: FileResult,
    scrollPosition?: EditorScrollPosition,
  ): WorkspaceDocumentRecord {
    const buffer = createEditorTextBuffer(file.content)
    const view = createEditorViewSession(buffer, `document:${file.path}`)
    view.setScrollPosition(scrollPosition)
    buffer.markClean()

    return {
      buffer,
      contentRevision: contentRevisionForText(file.content),
      fileVersion: file.version,
      path: file.path,
      revision: file.mtimeMs,
      scrollPosition,
      session: createEditorBufferSession(buffer, view),
      view,
    }
  }

  private replacementRecord(
    file: FileResult,
    cached: WorkspaceDocumentRecord | undefined,
  ): WorkspaceDocumentRecord {
    if (!cached) return this.createDocumentRecord(file)
    if (!textSnapshotEqualsText(cached.buffer.getTextSnapshot(), file.content)) {
      return this.createDocumentRecord(file, cached.scrollPosition)
    }

    cached.buffer.markClean()
    cached.revision = file.mtimeMs
    cached.fileVersion = file.version
    cached.contentRevision = contentRevisionForText(file.content)
    return cached
  }

  private rebindViewsForPath(path: string): void {
    const document = this.documents.get(path)
    if (!document) return

    for (const [tabId, view] of this.tabDocuments) {
      if (view.path !== path) continue

      const nextView = createEditorViewSession(document.buffer, `tab:${tabId}`)
      nextView.setScrollPosition(view.scrollPosition)
      this.tabDocuments.set(tabId, {
        ...view,
        session: createEditorBufferSession(document.buffer, nextView),
        view: nextView,
      })
    }
  }

  private documentProjection(document: WorkspaceDocumentRecord): WorkspaceDocumentProjection {
    return {
      buffer: document.buffer,
      contentRevision: document.contentRevision,
      fileVersion: document.fileVersion,
      path: document.path,
      revision: document.revision,
      scrollPosition: document.scrollPosition,
      session: document.session,
      view: document.view,
    }
  }

  private tabProjection(view: WorkspaceDocumentViewRecord): WorkspaceDocumentProjection {
    const document = this.documents.get(view.path)
    if (!document) {
      throw new Error(`Missing workspace document for tab ${view.tabId}`)
    }

    return {
      buffer: document.buffer,
      contentRevision: document.contentRevision,
      fileVersion: document.fileVersion,
      path: view.path,
      revision: document.revision,
      scrollPosition: view.scrollPosition,
      session: view.session,
      view: view.view,
    }
  }

  private isDirtyPath(path: string): boolean {
    if (this.dirtyFilePaths.has(path)) return true

    return this.documents.get(path)?.buffer.isDirty() === true
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
