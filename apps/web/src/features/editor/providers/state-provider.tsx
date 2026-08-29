import {
  createEditorConflictStore,
  EditorConflictStateContext,
} from '@/features/editor/state/conflict-state'
import {
  createEditorDocumentStore,
  EditorDocumentStateContext,
} from '@/features/editor/state/document-state'
import { createEditorUiStore, EditorUiStateContext } from '@/features/editor/state/ui-state'
import {
  createEditorWorkspaceStore,
  EditorWorkspaceStateContext,
} from '@/features/editor/state/workspace-state'
import {
  createSearchBufferStore,
  SearchBufferStateContext,
} from '@/features/search/state/buffer-state'
import { addressedWorkspaceCache } from '@/features/address/utils/cache'
import { parseAddress } from '@/features/address/utils/grammar'
import { readWorkspaceCache } from '@/features/workspace/state/cache'
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { WorkspaceEditProvider } from '@/features/editor/providers/workspace-edit-provider'
import { useQueryClient } from '@tanstack/react-query'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { createPlatformFileOpenPreparer } from '@/features/editor/utils/prepared-document'
import { FileOpenIntentService } from '@/lib/file-open-intent/state/service'
import { MountedEditorRegistry } from '@/lib/file-open-intent/state/mounted-editor-registry'
import { FileOpenIntentProvider } from '@/lib/file-open-intent/providers/context'
import { languageServerMatchQueryOptions } from '@/features/editor/utils/language-server-match-query'
import { useSettingValue } from '@/features/settings/hooks/use-setting-value'
import { fileSnapshotPathFromQueryKey } from '@/lib/file-snapshot-query-cache'
import { createEditorOpenBenchmarkControl } from '@/features/editor/state/editor-open-benchmark-control'
import { registerEditorOpenBenchmarkControl } from '@/features/editor/state/performance-trace'

export function EditorStateProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { appliedThemeId, selectedThemeId } = useEditorColorTheme()
  const syntaxHighlightingEnabled = useSettingValue('editor.syntaxHighlighting.enabled')
  const tyForPython = useSettingValue('lsp.experimental.tyForPython')
  const languageServers = useSettingValue('lsp.languageServers')
  const servers = useSettingValue('lsp.servers')
  // The address is folded in HERE, not applied later in an effect. Every store below
  // is seeded from this one value, so an address that arrived after them would have to
  // overwrite state the cache had already restored — which is how a shared link came to
  // close the recipient's tabs. One restore, from one merged value, before any store exists.
  const [workspaceCache] = useState(() =>
    addressedWorkspaceCache(readWorkspaceCache(), parseAddress(window.location.href)),
  )
  const [conflictStore] = useState(createEditorConflictStore)
  const [workspaceStore] = useState(() => createEditorWorkspaceStore(workspaceCache))
  const [documentStore] = useState(() =>
    createEditorDocumentStore({
      scrollPositionSeeds: workspaceStore.getState().scrollPositionByPath,
    }),
  )
  const [searchBufferStore] = useState(() =>
    createSearchBufferStore({
      cachedByRootPath: workspaceCache.searchBuffers,
      rootPath: workspaceCache.rootFolder?.path ?? null,
    }),
  )
  const [uiStore] = useState(createEditorUiStore)
  const [mountedEditors] = useState(() => new MountedEditorRegistry())
  const [fileOpenIntentService] = useState(
    () =>
      new FileOpenIntentService(
        queryClient,
        createPlatformFileOpenPreparer({
          appliedThemeId,
          selectedThemeId,
          syntaxHighlightingEnabled,
        }),
        (path) => documentStore.getState().getLiveEditorDocument(path),
        (path) => workspaceStore.getState().selectedFilePath === path,
        (path) => mountedEditors.has(path),
        (rootPath, path) =>
          queryClient.prefetchQuery(
            languageServerMatchQueryOptions(rootPath, path, {
              'lsp.experimental.tyForPython': tyForPython,
              'lsp.languageServers': languageServers,
              'lsp.servers': servers,
            }),
          ),
      ),
  )
  const [fileOpenIntent] = useState(() => ({
    mountedEditors,
    service: fileOpenIntentService,
  }))
  const [editorOpenBenchmarkControl] = useState(() =>
    createEditorOpenBenchmarkControl({
      documentStore,
      fileOpenIntent: fileOpenIntentService,
      mountedEditors,
      queryClient,
      searchStore: searchBufferStore,
      uiStore,
      workspaceStore,
    }),
  )

  useEffect(
    () => registerEditorOpenBenchmarkControl(editorOpenBenchmarkControl),
    [editorOpenBenchmarkControl],
  )

  useEffect(() => {
    fileOpenIntentService.setRoot(workspaceStore.getState().rootFolder?.path ?? null)
    return workspaceStore.subscribe(
      (state) => state.rootFolder?.path ?? null,
      (rootPath) => fileOpenIntentService.setRoot(rootPath),
    )
  }, [fileOpenIntentService, workspaceStore])

  useLayoutEffect(() => {
    fileOpenIntentService.setPreparationEnvironment(
      createPlatformFileOpenPreparer({
        appliedThemeId,
        selectedThemeId,
        syntaxHighlightingEnabled,
      }),
      `${appliedThemeId ?? ''}\u0000${selectedThemeId}\u0000${String(syntaxHighlightingEnabled)}`,
    )
  }, [appliedThemeId, fileOpenIntentService, selectedThemeId, syntaxHighlightingEnabled])

  useLayoutEffect(() => {
    fileOpenIntentService.setRelatedPrefetch((rootPath, path) =>
      queryClient.prefetchQuery(
        languageServerMatchQueryOptions(rootPath, path, {
          'lsp.experimental.tyForPython': tyForPython,
          'lsp.languageServers': languageServers,
          'lsp.servers': servers,
        }),
      ),
    )
  }, [fileOpenIntentService, languageServers, queryClient, servers, tyForPython])

  useEffect(
    () =>
      documentStore.subscribe(
        (state) => state.documentContentRevisions,
        (current, previous) => {
          for (const path of new Set([...Object.keys(current), ...Object.keys(previous)])) {
            if (current[path] === previous[path]) continue
            fileOpenIntentService.invalidatePath(path)
          }
        },
      ),
    [documentStore, fileOpenIntentService],
  )

  useEffect(
    () =>
      mountedEditors.subscribe((path, mounted) => {
        if (mounted) fileOpenIntentService.invalidatePath(path)
      }),
    [fileOpenIntentService, mountedEditors],
  )

  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' && event.type !== 'removed') return

        const path = fileSnapshotPathFromQueryKey(event.query.queryKey)
        if (path) fileOpenIntentService.invalidatePreparedPath(path)
      }),
    [fileOpenIntentService, queryClient],
  )

  useEffect(() => {
    fileOpenIntentService.connect()
    return () => fileOpenIntentService.scheduleDisconnect()
  }, [fileOpenIntentService])

  // A workspace switch swaps the slice synchronously, and zustand listeners fire
  // during `set` — so reseeding here lands before any view of the new workspace
  // is created.
  useEffect(
    () =>
      workspaceStore.subscribe(
        (state) => state.scrollPositionByPath,
        (scrollPositionByPath) =>
          documentStore.getState().seedEditorScrollPositions(scrollPositionByPath),
      ),
    [documentStore, workspaceStore],
  )

  return (
    <EditorWorkspaceStateContext value={workspaceStore}>
      <EditorConflictStateContext value={conflictStore}>
        <EditorDocumentStateContext value={documentStore}>
          <SearchBufferStateContext value={searchBufferStore}>
            <EditorUiStateContext value={uiStore}>
              <FileOpenIntentProvider value={fileOpenIntent}>
                <WorkspaceEditProvider>{children}</WorkspaceEditProvider>
              </FileOpenIntentProvider>
            </EditorUiStateContext>
          </SearchBufferStateContext>
        </EditorDocumentStateContext>
      </EditorConflictStateContext>
    </EditorWorkspaceStateContext>
  )
}
