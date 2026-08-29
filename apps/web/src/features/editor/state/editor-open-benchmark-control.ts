import type { Query, QueryClient } from '@tanstack/react-query'

import {
  createEditorActivation,
  createEditorCommands,
  type EditorCommands,
} from '@/features/editor/state/commands'
import type { EditorDocumentStoreApi } from '@/features/editor/state/document-state'
import {
  type EditorOpenBenchmarkControl,
  type EditorOpenSampleResetRequest,
  type EditorOpenSampleTarget,
} from '@/features/editor/state/performance-trace'
import type { EditorUiStoreApi } from '@/features/editor/state/ui-state'
import type { EditorWorkspaceStoreApi } from '@/features/editor/state/workspace-state'
import {
  awaitEditorShikiRuntimeSessionIdle,
  awaitEditorSyntaxWorkerIdleFences,
  awaitEditorTreeSitterRuntimeSessionIdle,
} from '@/features/editor/state/syntax-highlighting'
import type { SearchBufferStoreApi } from '@/features/search/state/buffer-state'
import { removeEditorVisibleSnapshotCacheForPath } from '@/lib/editor-visible-snapshot-cache'
import { ensureFileSnapshotQuery, fileSnapshotQueryOptions } from '@/lib/file-snapshot-query-cache'
import type { FileOpenIntentService } from '@/lib/file-open-intent/state/service'
import type { MountedEditorRegistry } from '@/lib/file-open-intent/state/mounted-editor-registry'
import { createClientInvariantError } from '@/lib/structured-errors'

const BENCHMARK_TARGET_TAB_PREFIX = 'editor-open-benchmark-target:'

export function createEditorOpenBenchmarkControl({
  documentStore,
  fileOpenIntent,
  mountedEditors,
  queryClient,
  searchStore,
  uiStore,
  workspaceStore,
}: {
  readonly documentStore: EditorDocumentStoreApi
  readonly fileOpenIntent: FileOpenIntentService
  readonly mountedEditors: MountedEditorRegistry
  readonly queryClient: QueryClient
  readonly searchStore: SearchBufferStoreApi
  readonly uiStore: EditorUiStoreApi
  readonly workspaceStore: EditorWorkspaceStoreApi
}): EditorOpenBenchmarkControl {
  const commands = createEditorCommands({
    activation: createEditorActivation(fileOpenIntent, documentStore),
    documentStore,
    searchStore,
    uiStore,
    workspaceStore,
  })
  let resetRunning = false

  return {
    begin: (request) => {
      assertTargetRoot(request, workspaceStore)
      assertTargetStateCleared(request, documentStore, mountedEditors, queryClient, workspaceStore)
      fileOpenIntent.beginBenchmarkSample(request.sampleId, request.path)
      installInactiveTargetTab(request.path, workspaceStore)
    },
    prime: async (request) => {
      assertTargetRoot(request, workspaceStore)
      await ensureFileSnapshotQuery(queryClient, request.path)
      return { ready: true }
    },
    reset: async (request) => {
      if (resetRunning) {
        throw createClientInvariantError('Editor-open benchmark reset is already running')
      }

      resetRunning = true
      try {
        return await resetEditorOpenSample({
          commands,
          documentStore,
          fileOpenIntent,
          mountedEditors,
          queryClient,
          request,
          workspaceStore,
        })
      } finally {
        resetRunning = false
      }
    },
  }
}

async function resetEditorOpenSample({
  commands,
  documentStore,
  fileOpenIntent,
  mountedEditors,
  queryClient,
  request,
  workspaceStore,
}: {
  readonly commands: EditorCommands
  readonly documentStore: EditorDocumentStoreApi
  readonly fileOpenIntent: FileOpenIntentService
  readonly mountedEditors: MountedEditorRegistry
  readonly queryClient: QueryClient
  readonly request: EditorOpenSampleResetRequest
  readonly workspaceStore: EditorWorkspaceStoreApi
}) {
  assertTargetRoot(request, workspaceStore)
  fileOpenIntent.quarantineBenchmarkSample(request.sampleId)
  assertTargetIsClean(request.path, documentStore)
  closeTargetTabs(request.path, commands, workspaceStore)
  await nextTaskAndFrame()
  if (mountedEditors.has(request.path)) {
    throw createClientInvariantError('Editor-open benchmark target remained mounted after close')
  }

  await clearTargetQueries(request, queryClient)
  deleteCleanTargetDocument(request.path, documentStore)
  removeEditorVisibleSnapshotCacheForPath(request)
  const result = await fileOpenIntent.finishBenchmarkSample(request.sampleId)
  await Promise.all([
    ...result.highlighterRuntimeSessionIds.map((runtimeSessionId) =>
      awaitEditorShikiRuntimeSessionIdle(runtimeSessionId),
    ),
    ...result.structuralRuntimeSessionIds.map((runtimeSessionId) =>
      awaitEditorTreeSitterRuntimeSessionIdle(runtimeSessionId),
    ),
  ])
  await awaitEditorSyntaxWorkerIdleFences()
  await nextTaskAndFrame()
  removeEditorVisibleSnapshotCacheForPath(request)
  assertTargetStateCleared(request, documentStore, mountedEditors, queryClient, workspaceStore)
  fileOpenIntent.releaseBenchmarkSample(request.sampleId)
  return { ...result, quiescent: true as const }
}

function assertTargetRoot(
  request: EditorOpenSampleTarget,
  workspaceStore: EditorWorkspaceStoreApi,
): void {
  if (workspaceStore.getState().rootFolder?.path === request.rootPath) return

  throw createClientInvariantError('Editor-open benchmark target root is not active')
}

function assertTargetIsClean(path: string, documentStore: EditorDocumentStoreApi): void {
  const document = documentStore.getState().getLiveEditorDocument(path)
  if (!document || !document.buffer.isDirty()) return

  throw createClientInvariantError('Editor-open benchmark cannot reset a dirty target')
}

function closeTargetTabs(
  path: string,
  commands: EditorCommands,
  workspaceStore: EditorWorkspaceStoreApi,
): void {
  const targetTabs = workspaceStore
    .getState()
    .workbenchPanels.editorTabs.filter((tab) => tab.path === path)
  for (const tab of targetTabs) commands.closeTab(tab.id)

  const activeTabId = workspaceStore.getState().workbenchPanels.activeEditorTabId
  if (activeTabId) return

  throw createClientInvariantError('Editor-open benchmark requires an inert editor surface')
}

function deleteCleanTargetDocument(path: string, documentStore: EditorDocumentStoreApi): void {
  const document = documentStore.getState().getLiveEditorDocument(path)
  if (!document) return
  if (document.buffer.isDirty()) {
    throw createClientInvariantError('Editor-open benchmark target became dirty during reset')
  }

  documentStore.getState().deleteLiveEditorDocument(document.id)
}

async function clearTargetQueries(
  request: EditorOpenSampleTarget,
  queryClient: QueryClient,
): Promise<void> {
  const queries = targetQueries(request, queryClient)
  if (queries.some((query) => query.getObserversCount() > 0)) {
    throw createClientInvariantError('Editor-open benchmark target query is still observed')
  }

  await Promise.all(
    queries.map((query) => queryClient.cancelQueries({ exact: true, queryKey: query.queryKey })),
  )
  if (queries.some((query) => query.state.fetchStatus !== 'idle')) {
    throw createClientInvariantError('Editor-open benchmark target query did not become idle')
  }
  for (const query of queries) {
    queryClient.removeQueries({ exact: true, queryKey: query.queryKey })
  }
}

function targetQueries(request: EditorOpenSampleTarget, queryClient: QueryClient): Query[] {
  const fileQueryKey = fileSnapshotQueryOptions(request.path).queryKey
  return queryClient.getQueryCache().findAll({
    predicate: (query) => {
      if (sameQueryKey(query.queryKey, fileQueryKey)) return true
      return (
        query.queryKey[0] === 'language-server-matches' &&
        query.queryKey[1] === request.rootPath &&
        query.queryKey[2] === request.path
      )
    },
  })
}

function sameQueryKey(left: readonly unknown[], right: readonly unknown[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function assertTargetStateCleared(
  request: EditorOpenSampleTarget,
  documentStore: EditorDocumentStoreApi,
  mountedEditors: MountedEditorRegistry,
  queryClient: QueryClient,
  workspaceStore: EditorWorkspaceStoreApi,
): void {
  const workspace = workspaceStore.getState()
  if (workspace.workbenchPanels.editorTabs.some((tab) => tab.path === request.path)) {
    throw createClientInvariantError('Editor-open benchmark target tab reappeared during reset')
  }
  if (documentStore.getState().getLiveEditorDocument(request.path)) {
    throw createClientInvariantError(
      'Editor-open benchmark target document reappeared during reset',
    )
  }
  if (
    Object.values(documentStore.getState().viewsByTabId).some(
      (view) => view.documentId === request.path,
    )
  ) {
    throw createClientInvariantError('Editor-open benchmark target view reappeared during reset')
  }
  if (mountedEditors.has(request.path)) {
    throw createClientInvariantError('Editor-open benchmark target host reappeared during reset')
  }
  if (targetQueries(request, queryClient).length > 0) {
    throw createClientInvariantError('Editor-open benchmark target query reappeared during reset')
  }
}

function installInactiveTargetTab(path: string, workspaceStore: EditorWorkspaceStoreApi): void {
  const workspace = workspaceStore.getState()
  const panels = workspace.workbenchPanels
  if (panels.editorTabs.some((tab) => tab.path === path)) return

  workspace.setWorkbenchPanels({
    ...panels,
    editorTabs: [
      ...panels.editorTabs,
      { id: `${BENCHMARK_TARGET_TAB_PREFIX}${crypto.randomUUID()}`, path },
    ],
  })
}

async function nextTaskAndFrame(): Promise<void> {
  await Promise.resolve()
  if (typeof requestAnimationFrame !== 'function') return

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}
