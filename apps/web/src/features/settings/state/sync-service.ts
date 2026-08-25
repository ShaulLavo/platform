import {
  errorStringField,
  type SettingsRawWriteResult,
  type SettingsSnapshot,
  type SettingsWriteTarget,
} from '@workspace/contracts'
import type { QueryClient } from '@tanstack/react-query'

import type {
  EditorDocumentStoreApi,
  LiveEditorDocument,
} from '@/features/editor/state/document-state'
import { clientInstanceId } from '@/lib/instance-id'
import { createClientInvariantError } from '@/lib/structured-errors'

import { saveSettingsText } from '@/features/settings/utils/api'
import { settingsKeys } from '@/features/settings/utils/query-keys'
import {
  admitSettingsRawResult,
  refreshConfirmedSettings,
} from '@/features/settings/state/snapshot-admission'

let fallbackRawWriteSequence = 0

/** Saves raw JSON with compare-and-swap; semantic controls never use this path. */
export class SettingsSyncService {
  constructor(
    private readonly documentStore: EditorDocumentStoreApi,
    private readonly queryClient: QueryClient,
  ) {}

  async save(document: LiveEditorDocument): Promise<void> {
    if (document.sync.kind !== 'settings') {
      throw createClientInvariantError(`Cannot save ${document.id} as settings text`)
    }
    if (document.sync.state === 'conflict') return

    await this.write(document, false)
  }

  async overwrite(document: LiveEditorDocument): Promise<void> {
    if (document.sync.kind !== 'settings') {
      throw createClientInvariantError(`Cannot overwrite ${document.id} as settings text`)
    }
    if (document.sync.state !== 'conflict') return
    if (document.sync.revision === null) return

    await this.write(document, true)
  }

  private async write(
    document: LiveEditorDocument,
    allowMatchingConflictCompletion: boolean,
  ): Promise<void> {
    if (document.sync.kind !== 'settings') return

    const sync = document.sync
    if (sync.revision === null) return

    const baseRevision = sync.revision
    const posted = document.buffer.materializeFullText()
    const savedContentRevision = document.contentRevision
    let result: SettingsRawWriteResult
    const request = {
      baseRevision,
      target: sync.target,
      text: posted,
      writeId: rawWriteId(),
    }
    try {
      result = await saveSettingsText(request)
    } catch (error) {
      if (errorStringField(error, 'code') !== 'settings.RAW_REVISION_STALE') throw error

      await this.enterConflict(document.id, sync.target)
      return
    }

    const admission = await admitSettingsRawResult(this.queryClient, result)
    if (admission.recoveryPending && admission.confirmation) {
      const confirmed = await admission.confirmation
      this.finishAdmittedWrite(
        document,
        sync.target,
        posted,
        savedContentRevision,
        baseRevision,
        allowMatchingConflictCompletion,
        result,
        confirmed.snapshot,
      )
      return
    }

    this.finishAdmittedWrite(
      document,
      sync.target,
      posted,
      savedContentRevision,
      baseRevision,
      allowMatchingConflictCompletion,
      result,
      admission.snapshot,
    )
  }

  private finishAdmittedWrite(
    document: LiveEditorDocument,
    target: SettingsWriteTarget,
    posted: string,
    savedContentRevision: string,
    baseRevision: string,
    allowMatchingConflictCompletion: boolean,
    result: SettingsRawWriteResult,
    snapshot: SettingsSnapshot | undefined,
  ) {
    if (!snapshot) return

    const confirmedFile = snapshot.layers.find((layer) => layer.id === target)?.file
    const writtenFile = result.snapshot.layers.find((layer) => layer.id === target)?.file
    if (!confirmedFile || !writtenFile) return
    if (confirmedFile.text !== writtenFile.text) {
      this.documentStore
        .getState()
        .markSettingsDocumentConflict(document.id, confirmedFile.text, confirmedFile.revision)
      return
    }

    this.finishWrite(
      document,
      posted,
      savedContentRevision,
      baseRevision,
      allowMatchingConflictCompletion,
      confirmedFile,
    )
  }

  private finishWrite(
    document: LiveEditorDocument,
    posted: string,
    savedContentRevision: string,
    baseRevision: string,
    allowMatchingConflictCompletion: boolean,
    written: { readonly revision: string; readonly text: string },
  ) {
    const current = this.documentStore.getState().getLiveEditorDocument(document.id)
    if (current?.sync.kind === 'settings' && current.sync.state === 'conflict') {
      if (!allowMatchingConflictCompletion) return
      const stillAtBase = current.sync.revision === baseRevision
      const alreadyReconciledWrite =
        current.sync.revision === written.revision && current.sync.confirmedText === written.text
      if (!stillAtBase && !alreadyReconciledWrite) return
    }

    const state = this.documentStore.getState()
    const marked = state.markSettingsDocumentSaved({
      documentId: document.id,
      revision: written.revision,
      savedContentRevision,
      savedText: posted,
    })
    if (marked && written.text !== posted) {
      state.replaceUnsyncedEditorDocumentText(document.id, written.text)
    }
  }

  private async enterConflict(documentId: string, target: SettingsWriteTarget) {
    const cached = this.queryClient.getQueryData<SettingsSnapshot>(settingsKeys.document())
    let snapshot: SettingsSnapshot | undefined
    try {
      snapshot = await refreshConfirmedSettings(this.queryClient)
    } catch {
      const cachedFile = cached?.layers.find((layer) => layer.id === target)?.file
      this.documentStore
        .getState()
        .markSettingsDocumentConflict(documentId, cachedFile?.text ?? null, null)
      this.scheduleConflictRefresh(documentId, target)
      return
    }
    const file = snapshot.layers.find((layer) => layer.id === target)?.file
    if (!file) {
      this.documentStore.getState().markSettingsDocumentConflict(documentId, null, null)
      return
    }

    this.documentStore.getState().markSettingsDocumentConflict(documentId, file.text, file.revision)
  }

  private scheduleConflictRefresh(documentId: string, target: SettingsWriteTarget) {
    void this.queryClient.invalidateQueries({ queryKey: settingsKeys.document() })
    void refreshConfirmedSettings(this.queryClient)
      .then((snapshot) => {
        const file = snapshot.layers.find((layer) => layer.id === target)?.file
        if (!file) return

        this.documentStore
          .getState()
          .markSettingsDocumentConflict(documentId, file.text, file.revision)
      })
      .catch(() => undefined)
  }
}

function rawWriteId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()

  fallbackRawWriteSequence += 1
  return `${clientInstanceId()}:settings-raw:${Date.now()}:${fallbackRawWriteSequence}`
}
