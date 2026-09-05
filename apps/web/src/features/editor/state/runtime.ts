import type { ScopedWorktreeRef } from '@workspace/contracts'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { createGitStore, type GitStoreApi } from '@/features/git/state/store'
import { workspaceLocationId } from '@/features/workspace/utils/location'
import type { ScopedStorage } from '@/lib/environments/state/scoped-storage'
import { LanguageServerDocumentSyncController } from '@singapor/lsp-plugin'
import type { QueryClient } from '@tanstack/react-query'

import type { WorkspaceEditHost } from '@/features/editor/providers/workspace-edit-context'
import { createEditorConflictStore } from '@/features/editor/state/conflict-state'
import { createEditorDocumentStore } from '@/features/editor/state/document-state'
import { createEditorOpenBenchmarkControl } from '@/features/editor/state/editor-open-benchmark-control'
import { FileSyncService } from '@/features/editor/state/file-sync-service'
import { EditorSaveService } from '@/features/editor/state/save-service'
import { createEditorUiStore } from '@/features/editor/state/ui-state'
import { createEditorWorkspaceStore } from '@/features/editor/state/workspace-state'
import { WorkspaceEditService } from '@/features/editor/state/workspace-edit-service'
import {
  createPlatformFileOpenPreparer,
  type EditorPreparedEnvironment,
} from '@/features/editor/utils/prepared-document'
import { createSearchBufferStore } from '@/features/search/state/buffer-state'
import { SettingsSyncService } from '@/features/settings/state/sync-service'
import type { CachedWorkspaceState } from '@/features/workspace/state/cache'
import { log } from '@/lib/client-logging'
import { MountedEditorRegistry } from '@/lib/file-open-intent/state/mounted-editor-registry'
import { FileOpenIntentService } from '@/lib/file-open-intent/state/service'
import { fileSnapshotPathFromQueryKey } from '@/lib/file-snapshot-query-cache'

export type EditorRuntime = ReturnType<typeof createEditorRuntime>

export function createEditorRuntime({
  queryClient,
  workspaceCache,
  storage,
  preparation,
  restoreAddress = true,
}: {
  readonly queryClient: QueryClient
  readonly storage: ScopedStorage
  readonly workspaceCache: CachedWorkspaceState
  readonly preparation: EditorPreparedEnvironment
  readonly restoreAddress?: boolean
}) {
  const conflictStore = createEditorConflictStore()
  const workspaceStore = createEditorWorkspaceStore(workspaceCache)
  const gitStores = new Map<string, GitStoreApi>()
  const bindWorktrees = () => {
    const worktrees =
      useChatProjectionStore.getState().slices[storage.environmentId]?.worktreeById ?? {}
    workspaceStore.getState().bindWorktrees(Object.values(worktrees))
    for (const worktree of Object.values(worktrees)) {
      const folderKey = workspaceLocationId(worktree.path, null)
      const folderStore = gitStores.get(folderKey)
      if (!folderStore) continue
      gitStores.set(workspaceLocationId(worktree.path, worktree.id), folderStore)
      gitStores.delete(folderKey)
    }
  }
  bindWorktrees()
  const documentStore = createEditorDocumentStore({
    scrollPositionSeeds: workspaceStore.getState().scrollPositionByPath,
  })
  const searchBufferStore = createSearchBufferStore({
    cachedByRootPath: workspaceCache.searchBuffers,
    rootPath: workspaceCache.rootFolder?.path ?? null,
  })
  const uiStore = createEditorUiStore()
  const mountedEditors = new MountedEditorRegistry()
  const fileOpenIntentService = new FileOpenIntentService(
    queryClient,
    createPlatformFileOpenPreparer(preparation),
    (path) => documentStore.getState().getLiveEditorDocument(path),
    (path) => workspaceStore.getState().selectedFilePath === path,
    (path) => mountedEditors.has(path),
    () => undefined,
  )
  const documentSyncController = new LanguageServerDocumentSyncController()
  const fileSync = new FileSyncService(documentStore, queryClient)
  let rootGeneration = 1
  let active = false
  let disposed = false
  let addressRestored = !restoreAddress
  let recoveryDiscovery: { readonly generation: number; readonly promise: Promise<void> } | null =
    null
  const workspaceEditService = new WorkspaceEditService({
    documentStore,
    documentSyncController,
    fileSync,
    getRoot: () => workspaceRoot(workspaceStore, rootGeneration),
  })
  const workspaceEditHost: WorkspaceEditHost = {
    documentSyncController,
    isOwnEvent: (writeId) => workspaceEditService.isOwnEvent(writeId),
    onApplyWorkspaceEdit: workspaceEditService.onApplyWorkspaceEdit,
  }
  const saveService = new EditorSaveService(
    documentStore,
    fileSync,
    new SettingsSyncService(documentStore, queryClient),
  )
  const editorOpenBenchmarkControl = createEditorOpenBenchmarkControl({
    storage,
    documentStore,
    fileOpenIntent: fileOpenIntentService,
    mountedEditors,
    queryClient,
    searchStore: searchBufferStore,
    uiStore,
    workspaceStore,
  })
  const discoverRecovery = () => {
    const generation = rootGeneration
    if (recoveryDiscovery?.generation === generation) return
    const promise = workspaceEditService
      .discoverRecovery()
      .catch(reportRecoveryFailure)
      .finally(() => {
        if (recoveryDiscovery?.generation === generation) recoveryDiscovery = null
      })
    recoveryDiscovery = { generation, promise }
  }
  const subscriptions = [
    useChatProjectionStore.subscribe((state, previous) => {
      if (
        state.slices[storage.environmentId]?.worktreeById ===
        previous.slices[storage.environmentId]?.worktreeById
      )
        return
      bindWorktrees()
    }),
    workspaceStore.subscribe(
      (state) => state.rootFolder?.path ?? null,
      (rootPath) => {
        rootGeneration += 1
        fileOpenIntentService.setRoot(rootPath)
        workspaceEditService.resetForRoot()
        if (active) discoverRecovery()
      },
    ),
    workspaceStore.subscribe(
      (state) => state.scrollPositionByPath,
      (positions) => documentStore.getState().seedEditorScrollPositions(positions),
    ),
    documentStore.subscribe(
      (state) => state.documentContentRevisions,
      (current, previous) => invalidateChangedDocuments(fileOpenIntentService, current, previous),
    ),
    mountedEditors.subscribe((path, mounted) => {
      if (mounted) fileOpenIntentService.invalidatePath(path)
    }),
    queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' && event.type !== 'removed') return
      const path = fileSnapshotPathFromQueryKey(event.query.queryKey)
      if (path) fileOpenIntentService.invalidatePreparedPath(path)
    }),
  ]
  fileOpenIntentService.setRoot(workspaceStore.getState().rootFolder?.path ?? null)

  const suspend = () => {
    if (!active) return
    active = false
    fileOpenIntentService.disposeNow()
  }

  return {
    storage,
    queryClient,
    worktreeRefForRoot(rootPath: string): ScopedWorktreeRef | null {
      const worktreeId = workspaceStore.getState().worktreeIdByRootPath[rootPath]
      return worktreeId ? { environmentId: storage.environmentId, worktreeId } : null
    },
    gitStoreForRoot(rootPath: string) {
      const worktreeId = workspaceStore.getState().worktreeIdByRootPath[rootPath] ?? null
      const key = workspaceLocationId(rootPath, worktreeId)
      const store = gitStores.get(key) ?? createGitStore()
      gitStores.set(key, store)
      return store
    },
    conflictStore,
    workspaceStore,
    documentStore,
    searchBufferStore,
    uiStore,
    mountedEditors,
    fileOpenIntentService,
    fileOpenIntent: { mountedEditors, service: fileOpenIntentService },
    editorOpenBenchmarkControl,
    documentSyncController,
    workspaceEditService,
    workspaceEditHost,
    saveService,
    resume() {
      if (active || disposed) return
      active = true
      fileOpenIntentService.connect()
      discoverRecovery()
    },
    suspend,
    dispose() {
      if (disposed) return
      suspend()
      disposed = true
      for (const unsubscribe of subscriptions) unsubscribe()
      fileOpenIntentService.disposeNow()
      workspaceEditService.dispose()
    },
    hasUnsavedDocuments() {
      const state = documentStore.getState()
      return (
        state.dirtyFilePaths.size > 0 ||
        Object.values(state.liveDocumentsById).some((document) => document.buffer.isDirty())
      )
    },
    claimAddressRestore() {
      if (addressRestored) return false
      addressRestored = true
      return true
    },
  }
}

function invalidateChangedDocuments(
  service: FileOpenIntentService,
  current: Readonly<Record<string, string>>,
  previous: Readonly<Record<string, string>>,
): void {
  for (const path of new Set([...Object.keys(current), ...Object.keys(previous)])) {
    if (current[path] === previous[path]) continue
    service.invalidatePath(path)
  }
}

function workspaceRoot(store: ReturnType<typeof createEditorWorkspaceStore>, generation: number) {
  const root = store.getState().rootFolder
  if (!root) return null
  const normalized = root.path.replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '')
  return {
    generation,
    path: root.path,
    uriPath: normalized ? `/${normalized}` : '/',
    workspacePath: root.path,
  }
}

function reportRecoveryFailure(error: unknown): void {
  log.warn({ action: 'workspace_edit.recovery_discovery_failed', area: 'workspace-edit', error })
}
