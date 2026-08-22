import { createClientInvariantError } from '@/lib/structured-errors'

import {
  contentRevisionForText,
  textSnapshotEqualsText,
} from '@/features/editor/utils/text-snapshot'
import type { SettingsWriteTarget } from '@workspace/contracts'

import type { FileResult } from '@/lib/file-system-types'
import {
  createEditorTextBuffer,
  createEditorViewSession,
  type EditorScrollPosition,
  type EditorTextBuffer,
  type EditorViewSession,
} from '@singapor/core'

type LiveDocumentSyncState = 'idle' | 'saving' | 'conflict'

/**
 * Where a document's contents came from, and therefore where a save sends them.
 *
 * `settings` exists because "can this be saved" and "is this a path on disk" are
 * different questions. A raw settings.json buffer is written through
 * `POST /settings/raw` — the fs routes only take workspace-relative paths, and
 * the settings file is addressed by layer rather than by path — so it is savable
 * without ever being file-backed. Keeping that on the document rather than in a
 * predicate over the id is what stops the save path from growing a second
 * spelling of the same question.
 */
type LiveDocumentSync =
  | {
      fileVersion: string
      kind: 'file'
      mtimeMs: number
      path: string
      state: LiveDocumentSyncState
    }
  | {
      kind: 'settings'
      /** The revision the buffer was seeded from; the raw write guards on it. */
      revision: string
      state: LiveDocumentSyncState
      target: SettingsWriteTarget
    }
  | {
      kind: 'none'
    }

export type LiveEditorDocument = {
  readonly buffer: EditorTextBuffer
  readonly contentRevision: string
  readonly id: string
  readonly localRevision: number
  readonly path: string
  readonly sync: LiveDocumentSync
}

export type EditorDocumentView = {
  readonly documentId: string
  readonly scrollPosition?: EditorScrollPosition
  readonly tabId: string
  readonly view: EditorViewSession
}

export type LiveEditorViewDocument = LiveEditorDocument & {
  readonly scrollPosition?: EditorScrollPosition
  readonly tabId: string
  readonly view: EditorViewSession
}

export type UnsyncedLiveEditorDocumentInput = {
  content: string
  id: string
  /** Omitted for a buffer nothing can write back, such as a conflict snapshot. */
  sync?: Exclude<LiveDocumentSync, { kind: 'file' }>
}

export type WorkspaceDocumentServiceState = {
  documentContentRevisions: Readonly<Record<string, string>>
  dirtyContentRevision: number
  dirtyFilePaths: ReadonlySet<string>
  liveDocumentsById: Readonly<Record<string, LiveEditorDocument>>
  scrollPositionByTabId: Readonly<Record<string, EditorScrollPosition>>
  viewsByTabId: Readonly<Record<string, EditorDocumentView>>
}

export class WorkspaceDocumentService {
  private documentContentRevisions: Readonly<Record<string, string>> = {}
  private dirtyFilePaths: ReadonlySet<string> = new Set()
  private dirtyContentRevision = 0
  private readonly liveDocumentsById = new Map<string, LiveEditorDocument>()
  private readonly viewsByTabId = new Map<string, EditorDocumentView>()
  /**
   * Last known scroll position per document, seeded from the workspace cache.
   * Read when a view is created, so a reopened file (or a refreshed app)
   * lands where it was; updated on every scroll write.
   */
  private readonly scrollPositionSeeds = new Map<string, EditorScrollPosition>()
  private cachedState: WorkspaceDocumentServiceState | null = null

  /**
   * The single eviction path. Drops every live document and view outside the keep
   * sets, and nothing else — dirty buffers and unsynced documents (conflict and
   * search buffers, which have no disk backing) are never evictable, so switching
   * projects can no longer destroy unrecoverable content.
   *
   * Deleting through deleteLiveDocument is mandatory, not stylistic: it removes
   * every view bound to the document. A view outliving its document is a hard
   * crash through getRequiredLiveDocument.
   */
  retain({
    documentIds,
    tabIds,
  }: {
    documentIds: ReadonlySet<string>
    tabIds: ReadonlySet<string>
  }): { evictedDocumentIds: string[]; evictedTabIds: string[] } {
    const evictedDocumentIds: string[] = []
    for (const [documentId, document] of this.liveDocumentsById) {
      if (documentIds.has(documentId)) continue
      if (this.isDirtyDocument(documentId)) continue
      if (document.sync.kind !== 'file') continue

      this.deleteLiveDocument(documentId)
      evictedDocumentIds.push(documentId)
    }

    // After the document pass: deleteLiveDocument has already removed the views
    // belonging to evicted documents, so anything left here is a kept document
    // whose tab is simply gone.
    const evictedTabIds: string[] = []
    for (const tabId of this.viewsByTabId.keys()) {
      if (tabIds.has(tabId)) continue

      this.viewsByTabId.delete(tabId)
      evictedTabIds.push(tabId)
    }

    return { evictedDocumentIds, evictedTabIds }
  }

  deleteLiveDocument(documentId: string): { hadLiveDocument: boolean; wasDirty: boolean } {
    const document = this.liveDocumentsById.get(documentId)
    const path = document?.path ?? documentId
    const wasDirty = this.isDirtyDocument(documentId)
    const hadLiveDocument = this.liveDocumentsById.delete(documentId)

    this.deleteDirtyPath(path)
    this.documentContentRevisions = omitKey(this.documentContentRevisions, documentId)

    for (const [tabId, view] of this.viewsByTabId) {
      if (view.documentId !== documentId) continue

      this.viewsByTabId.delete(tabId)
    }

    return { hadLiveDocument, wasDirty }
  }

  ensureLiveDocument(file: FileResult): LiveEditorDocument {
    const existing = this.liveDocumentsById.get(file.path)
    if (existing?.buffer.isDirty()) return existing
    if (existing && fileSyncVersion(existing) === file.version) {
      return existing
    }

    const record = this.createFileDocument(file)
    this.liveDocumentsById.set(file.path, record)
    this.setContentRevision(file.path, record.contentRevision)
    this.deleteDirtyPath(file.path)
    this.rebindViewsForDocument(file.path)
    return record
  }

  ensureView(tabId: string, file: FileResult): LiveEditorViewDocument {
    const document = this.ensureLiveDocument(file)
    return this.ensureViewForDocument(tabId, document.id)
  }

  ensureUnsyncedDocument(input: UnsyncedLiveEditorDocumentInput): LiveEditorDocument {
    const existing = this.liveDocumentsById.get(input.id)
    if (existing?.buffer.isDirty()) return existing
    if (existing && textSnapshotEqualsText(existing.buffer.getTextSnapshot(), input.content)) {
      return existing
    }

    const record = this.createUnsyncedDocument(input)
    this.liveDocumentsById.set(input.id, record)
    this.setContentRevision(input.id, record.contentRevision)
    this.rebindViewsForDocument(input.id)
    return record
  }

  ensureViewForDocument(tabId: string, documentId: string): LiveEditorViewDocument {
    const document = this.getRequiredLiveDocument(documentId)
    const existing = this.viewsByTabId.get(tabId)
    if (existing?.documentId === document.id) {
      return this.viewDocumentProjection(existing)
    }

    const scrollPosition = existing?.scrollPosition ?? this.scrollPositionSeeds.get(document.id)
    const view = createEditorViewSession(document.buffer, `tab:${tabId}`)
    view.setScrollPosition(scrollPosition)
    const nextView: EditorDocumentView = {
      documentId: document.id,
      scrollPosition,
      tabId,
      view,
    }
    this.viewsByTabId.set(tabId, nextView)

    return this.viewDocumentProjection(nextView)
  }

  removeView(tabId: string): boolean {
    const view = this.viewsByTabId.get(tabId)
    if (!view) return false

    this.viewsByTabId.delete(tabId)
    return true
  }

  forceReplaceLiveDocument(file: FileResult): { changed: boolean; wasDirty: boolean } {
    const wasDirty = this.isDirtyDocument(file.path)
    const existing = this.liveDocumentsById.get(file.path)
    if (existing && !wasDirty && fileSyncVersion(existing) === file.version) {
      if (textSnapshotEqualsText(existing.buffer.getTextSnapshot(), file.content)) {
        return { changed: false, wasDirty: false }
      }
    }

    const record = this.replacementDocument(file, existing)

    this.liveDocumentsById.set(file.path, record)
    this.setContentRevision(file.path, record.contentRevision)
    this.deleteDirtyPath(file.path)
    this.rebindViewsForDocument(file.path)
    return { changed: true, wasDirty }
  }

  getLiveDocument(documentId: string): LiveEditorDocument | null {
    return this.liveDocumentsById.get(documentId) ?? null
  }

  getView(tabId: string): EditorDocumentView | null {
    return this.viewsByTabId.get(tabId) ?? null
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

    return this.applySaved(
      document,
      { ...document.sync, fileVersion, mtimeMs, state: 'idle' },
      savedContentRevision,
      savedText,
    )
  }

  /**
   * The raw settings write landed. `revision` is the file's new hash, which the
   * next save guards on — without advancing it every subsequent save of the same
   * buffer refuses itself as stale.
   */
  markSettingsSaved({
    documentId,
    revision,
    savedContentRevision,
    savedText,
  }: {
    documentId: string
    revision: string
    savedContentRevision: string
    savedText: string
  }): boolean {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) return false
    if (document.sync.kind !== 'settings') return false

    return this.applySaved(
      document,
      { ...document.sync, revision, state: 'idle' },
      savedContentRevision,
      savedText,
    )
  }

  /**
   * Re-seeds an unsynced buffer from text it did not produce.
   *
   * A raw settings save is not always byte-preserving: the server lifts a
   * provider credential out of the document into the secret store and rewrites
   * that subtree, so what is on disk afterwards is not what was posted. Leaving
   * the buffer holding the old text would show a secret that is no longer in the
   * file, and the next save would put it back.
   */
  replaceUnsyncedDocumentText(documentId: string, text: string): boolean {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) return false
    if (document.sync.kind === 'file') return false
    if (textSnapshotEqualsText(document.buffer.getTextSnapshot(), text)) return false

    const buffer = createEditorTextBuffer(text)
    buffer.markClean()
    const contentRevision = contentRevisionForText(text)
    this.liveDocumentsById.set(documentId, {
      ...document,
      buffer,
      contentRevision,
      localRevision: buffer.getRevision(),
    })
    // The map mirrors the record; every other writer keeps them together, and a
    // consumer that reads the map to decide whether the text moved would
    // otherwise never notice this one.
    this.setContentRevision(documentId, contentRevision)
    this.deleteDirtyPath(document.path)
    this.rebindViewsForDocument(documentId)
    return true
  }

  /**
   * Brings a settings buffer back in step with the file.
   *
   * The buffer guards its save on the revision it was seeded from, and only a
   * successful save advances that. Without this, any other write to the same
   * layer — a toggle on the settings form, another window, a hand-edit — leaves
   * the buffer holding a revision the server has moved past, and every save from
   * then on refuses itself as stale with no way back. Documents also outlive
   * their tab (`retain` only evicts file-backed ones), so a reopened settings tab
   * would otherwise show whatever the bytes were when it was last opened.
   *
   * A dirty buffer is left alone on purpose: the user is mid-edit, and replacing
   * their text is worse than the conflict they get on save, which at least says
   * what happened.
   */
  reconcileSettingsDocument(documentId: string, text: string, revision: string): boolean {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) return false
    if (document.sync.kind !== 'settings') return false
    if (document.sync.revision === revision) return false
    if (document.buffer.isDirty()) return false

    const buffer = createEditorTextBuffer(text)
    buffer.markClean()
    const contentRevision = contentRevisionForText(text)
    this.liveDocumentsById.set(documentId, {
      ...document,
      buffer,
      contentRevision,
      localRevision: buffer.getRevision(),
      sync: { ...document.sync, revision },
    })
    this.setContentRevision(documentId, contentRevision)
    this.deleteDirtyPath(document.path)
    this.rebindViewsForDocument(documentId)
    return true
  }

  private applySaved(
    document: LiveEditorDocument,
    sync: LiveDocumentSync,
    savedContentRevision: string,
    savedText: string,
  ): boolean {
    // The write already landed on disk, so the sync metadata advances even
    // when in-flight edits make the content checks below fail.
    const synced: LiveEditorDocument = { ...document, sync }
    this.liveDocumentsById.set(document.id, synced)
    if (document.contentRevision !== savedContentRevision) return false
    if (!textSnapshotEqualsText(document.buffer.getTextSnapshot(), savedText)) return false

    document.buffer.markClean()
    this.liveDocumentsById.set(document.id, {
      ...synced,
      localRevision: document.buffer.getRevision(),
    })
    this.deleteDirtyPath(document.path)
    return true
  }

  recordTextChange(documentId: string): void {
    this.dirtyContentRevision += 1
    const contentRevision = editedContentRevision(this.dirtyContentRevision)
    const document = this.liveDocumentsById.get(documentId)
    if (!document) {
      this.addDirtyPath(documentId)
      return
    }

    this.liveDocumentsById.set(documentId, {
      ...document,
      contentRevision,
      localRevision: document.buffer.getRevision(),
    })
    this.setContentRevision(documentId, contentRevision)
    this.addDirtyPath(document.path)
  }

  renameLiveDocument(from: string, to: string): { wasDirty: boolean } {
    const wasDirty = this.isDirtyDocument(from)
    const document = this.liveDocumentsById.get(from)
    const contentRevision = this.documentContentRevisions[from]

    this.liveDocumentsById.delete(from)
    this.documentContentRevisions = omitKey(this.documentContentRevisions, from)
    this.renameDirtyPath(from, to)

    if (contentRevision !== undefined) this.setContentRevision(to, contentRevision)
    if (document) {
      this.liveDocumentsById.set(to, {
        ...document,
        id: to,
        path: to,
        sync: document.sync.kind === 'file' ? { ...document.sync, path: to } : document.sync,
      })
    }

    for (const [tabId, view] of this.viewsByTabId) {
      if (view.documentId !== from) continue

      this.viewsByTabId.set(tabId, { ...view, documentId: to })
    }

    return { wasDirty }
  }

  setDirty(documentId: string, dirty: boolean): void {
    const path = this.liveDocumentsById.get(documentId)?.path ?? documentId
    if (dirty) {
      this.addDirtyPath(path)
      return
    }

    this.deleteDirtyPath(path)
  }

  setViewScrollPosition(tabId: string, scrollPosition: EditorScrollPosition): boolean {
    const view = this.viewsByTabId.get(tabId)
    if (!view) return false
    if (scrollPositionsEqual(view.scrollPosition, scrollPosition)) return false

    this.viewsByTabId.set(tabId, { ...view, scrollPosition })
    this.scrollPositionSeeds.set(view.documentId, scrollPosition)
    view.view.setScrollPosition(scrollPosition)
    return true
  }

  seedScrollPositions(byPath: Readonly<Record<string, EditorScrollPosition>>): void {
    this.scrollPositionSeeds.clear()
    for (const [path, scrollPosition] of Object.entries(byPath)) {
      this.scrollPositionSeeds.set(path, scrollPosition)
    }
  }

  /**
   * Documents and views are replaced on write, never mutated in place, so an
   * unchanged entry keeps its identity for free and a slice is reused wholesale
   * when every entry survives. That is what lets high-frequency writes
   * (per-frame scroll position updates) notify the store without re-rendering
   * subscribers of unrelated slices.
   */
  state(): WorkspaceDocumentServiceState {
    const previous = this.cachedState
    const viewsByTabId = recordFromMap(this.viewsByTabId, previous?.viewsByTabId)
    const next: WorkspaceDocumentServiceState = {
      documentContentRevisions: this.documentContentRevisions,
      dirtyContentRevision: this.dirtyContentRevision,
      dirtyFilePaths: this.dirtyFilePaths,
      liveDocumentsById: recordFromMap(this.liveDocumentsById, previous?.liveDocumentsById),
      scrollPositionByTabId: this.scrollPositionsState(
        viewsByTabId,
        previous?.scrollPositionByTabId,
      ),
      viewsByTabId,
    }
    this.cachedState = next
    return next
  }

  private scrollPositionsState(
    viewsByTabId: Readonly<Record<string, EditorDocumentView>>,
    previous: Readonly<Record<string, EditorScrollPosition>> | undefined,
  ): Readonly<Record<string, EditorScrollPosition>> {
    let count = 0
    let unchanged = previous !== undefined
    const next: Record<string, EditorScrollPosition> = {}
    for (const [tabId, view] of Object.entries(viewsByTabId)) {
      if (view.scrollPosition === undefined) continue
      next[tabId] = view.scrollPosition
      count += 1
      if (previous?.[tabId] !== view.scrollPosition) unchanged = false
    }
    if (unchanged && previous && Object.keys(previous).length === count) return previous
    return next
  }

  private createFileDocument(file: FileResult): LiveEditorDocument {
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

  private createUnsyncedDocument(input: UnsyncedLiveEditorDocumentInput): LiveEditorDocument {
    const buffer = createEditorTextBuffer(input.content)
    buffer.markClean()

    return {
      buffer,
      contentRevision: contentRevisionForText(input.content),
      id: input.id,
      localRevision: buffer.getRevision(),
      path: input.id,
      sync: input.sync ?? { kind: 'none' },
    }
  }

  private replacementDocument(
    file: FileResult,
    existing: LiveEditorDocument | undefined,
  ): LiveEditorDocument {
    if (!existing) return this.createFileDocument(file)
    if (!textSnapshotEqualsText(existing.buffer.getTextSnapshot(), file.content)) {
      return this.createFileDocument(file)
    }

    existing.buffer.markClean()
    return {
      ...existing,
      contentRevision: contentRevisionForText(file.content),
      localRevision: existing.buffer.getRevision(),
      sync: {
        fileVersion: file.version,
        kind: 'file',
        mtimeMs: file.mtimeMs,
        path: file.path,
        state: 'idle',
      },
    }
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

  private viewDocumentProjection(view: EditorDocumentView): LiveEditorViewDocument {
    const document = this.getRequiredLiveDocument(view.documentId)

    return {
      ...document,
      scrollPosition: view.scrollPosition,
      tabId: view.tabId,
      view: view.view,
    }
  }

  private getRequiredLiveDocument(documentId: string): LiveEditorDocument {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) {
      throw createClientInvariantError(`Missing live document ${documentId}`)
    }

    return document
  }

  isDirtyDocument(documentId: string): boolean {
    const document = this.liveDocumentsById.get(documentId)
    if (!document) return this.dirtyFilePaths.has(documentId)
    if (this.dirtyFilePaths.has(document.path)) return true

    return document.buffer.isDirty()
  }

  private renameDirtyPath(from: string, to: string): void {
    if (!this.dirtyFilePaths.has(from)) return

    const next = new Set(this.dirtyFilePaths)
    next.delete(from)
    next.add(to)
    this.dirtyFilePaths = next
  }

  private addDirtyPath(path: string): void {
    if (this.dirtyFilePaths.has(path)) return

    const next = new Set(this.dirtyFilePaths)
    next.add(path)
    this.dirtyFilePaths = next
  }

  private deleteDirtyPath(path: string): void {
    if (!this.dirtyFilePaths.has(path)) return

    const next = new Set(this.dirtyFilePaths)
    next.delete(path)
    this.dirtyFilePaths = next
  }

  private setContentRevision(documentId: string, contentRevision: string): void {
    this.documentContentRevisions = {
      ...this.documentContentRevisions,
      [documentId]: contentRevision,
    }
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

function fileSyncVersion(document: LiveEditorDocument | undefined) {
  if (!document) return null
  if (document.sync.kind !== 'file') return null

  return document.sync.fileVersion
}

function omitKey(
  record: Readonly<Record<string, string>>,
  key: string,
): Readonly<Record<string, string>> {
  if (!(key in record)) return record

  const next = { ...record }
  delete next[key]
  return next
}

/**
 * A Map rendered as a plain record for zustand selectors. Values are passed
 * through untouched — the Map already holds the only representation — and the
 * previous record is reused wholesale when every entry survived, so a
 * high-frequency write (per-frame scroll position) does not invalidate
 * subscribers of unrelated slices.
 */
function recordFromMap<T>(
  source: Map<string, T>,
  previous: Readonly<Record<string, T>> | undefined,
): Readonly<Record<string, T>> {
  let unchanged = previous !== undefined && Object.keys(previous).length === source.size
  const next: Record<string, T> = {}
  for (const [key, value] of source) {
    next[key] = value
    if (previous?.[key] !== value) unchanged = false
  }
  if (unchanged && previous) return previous
  return next
}
