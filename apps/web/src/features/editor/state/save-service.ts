import type { EditorDocumentStoreApi } from '@/features/editor/state/document-state'
import type { FileSyncService } from '@/features/editor/state/file-sync-service'
import {
  dirtySavableEditorDocuments,
  isDirtyLiveEditorDocument,
  isSavableEditorDocument,
} from '@/features/editor/utils/save'
import type { SettingsSyncService } from '@/features/settings/state/sync-service'

export class EditorSaveService {
  constructor(
    private readonly documentStore: EditorDocumentStoreApi,
    private readonly fileSync: FileSyncService,
    private readonly settingsSync: SettingsSyncService,
  ) {}

  async save(path: string): Promise<boolean> {
    const state = this.documentStore.getState()
    const document = state.getLiveEditorDocument(path)
    if (!document || !isSavableEditorDocument(document)) return false
    if (!isDirtyLiveEditorDocument(state, path)) return true

    if (document.sync.kind === 'settings') {
      await this.settingsSync.save(document)
      return true
    }

    await this.fileSync.save(document)
    return true
  }

  async saveMany(
    paths: readonly string[],
    onSaved?: (path: string) => void,
  ): Promise<readonly boolean[]> {
    const results: boolean[] = []
    const failures: unknown[] = []

    // A failed document must not prevent later documents from reaching their owner.
    for (const path of paths) {
      try {
        results.push(await this.saveAndReport(path, onSaved))
      } catch (error) {
        results.push(false)
        failures.push(error)
      }
    }

    if (failures.length > 0) throw failures[0]
    return results
  }

  async saveAll(onSaved?: (path: string) => void): Promise<void> {
    const paths = dirtySavableEditorDocuments(this.documentStore.getState()).map(
      (document) => document.id,
    )
    await this.saveMany(paths, onSaved)
  }

  private async saveAndReport(path: string, onSaved?: (path: string) => void): Promise<boolean> {
    const wasDirty = isDirtyLiveEditorDocument(this.documentStore.getState(), path)
    const saved = await this.save(path)
    if (saved && wasDirty) onSaved?.(path)
    return saved
  }
}
