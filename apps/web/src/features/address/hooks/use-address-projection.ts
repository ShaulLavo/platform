import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'

import { writeAddressCache } from '@/features/address/state/address-storage'
import { createAddressProjection } from '@/features/address/state/projection'
import { parseAddress } from '@/features/address/utils/grammar'
import { addressFromSnapshot, emptyAddressSnapshot } from '@/features/address/utils/snapshot'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { useThreadDiffScopeStore } from '@/features/chat/state/thread-diff-scope-store'
import { diffScopeParam } from '@/features/address/utils/diff-scope'
import { sessionTokenFor } from '@/features/address/utils/session-token'
import { useSearchBufferStoreApi } from '@/features/search/search-buffer-state'
import { searchParamsFor } from '@/features/address/utils/search-params'
import type { SearchBufferStoreApi } from '@/features/search/search-buffer-state'
import { readLogsFilters, subscribeLogsFilters } from '@/features/logs/state/filter-store'
import { defaultLogsFilterState } from '@/features/logs/log-filter-params'
import { logsParamsFor } from '@/features/address/utils/logs-params'
import { createDefaultChatModePanels } from '@/features/chat-mode/utils/panels'
import { createDefaultWorkbenchPanels } from '@/features/workbench/utils/workbench-panels'
import { readSettingsCategory } from '@/features/settings/state/category-store'
import { settingsCategorySlug } from '@/features/address/utils/settings-category'
import { useEditorUiStoreApi } from '@/features/editor/state/editor-ui-state'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import { activeEditorTabForWorkbenchPanels } from '@/features/workbench/utils/workbench-panels'
import type { EditorUiStoreApi } from '@/features/editor/state/editor-ui-state'
import type { EditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'

/**
 * Mounted once, next to the cache persistence it will eventually replace.
 *
 * Read-only in this milestone: the store is the source of truth and the URL is a
 * rendering of it. Nothing here reads the address back, so there is exactly one
 * outbound edge and no echo to guard against.
 */
export function useAddressProjection() {
  const router = useRouter()
  const storeApi = useEditorWorkspaceStoreApi()
  const uiStoreApi = useEditorUiStoreApi()
  const searchStoreApi = useSearchBufferStoreApi()
  // Captured once, before the first write, and carried into every address after it.
  // Four dev params are read by code outside React's lifecycle — two of them LATE,
  // `editorPerfLayout` during every editor render and `decode` on the first editor's
  // idle callback — so a projection that dropped them would change behaviour
  // mid-session with no error and no log.
  const [passthrough] = useState(() => parseAddress(window.location.href).passthrough)

  useEffect(() => {
    const projection = createAddressProjection({
      now: () => performance.now(),
      // A timer, not `requestAnimationFrame`: rAF does not fire in a background or
      // not-yet-interacted tab, which left the address stuck at `/` until the user
      // clicked something. A macrotask still coalesces a synchronous burst, and the
      // identical-href guard absorbs the rest.
      schedule: (write) => {
        setTimeout(write, 0)
      },
      // The router's history, not `navigate`: a projection is a URL rewrite, not a
      // navigation. Going through the history keeps this a single outbound edge — no
      // route match, no transition, and no re-render that would turn the write back
      // into an inbound apply.
      writer: {
        push: (href) => {
          router.history.push(href)
          writeAddressCache(href)
        },
        // The other half of the dual serialization. Writing both from one place is
        // what guarantees the URL and the restore payload cannot disagree.
        replace: (href) => {
          router.history.replace(href)
          writeAddressCache(href)
        },
      },
    })

    const project = () => {
      projection.project(
        addressFromSnapshot(snapshotFromStore(storeApi, uiStoreApi, searchStoreApi, passthrough)),
      )
    }

    project()
    const unsubscribeSelection = useSessionSelectionStore.subscribe(project)
    const unsubscribeRail = useSessionRailStore.subscribe(project)
    const unsubscribeDiffScope = useThreadDiffScopeStore.subscribe(project)
    const unsubscribeWorkspace = storeApi.subscribe(project)
    const unsubscribeUi = uiStoreApi.subscribe(project)
    const unsubscribeSearch = searchStoreApi.subscribe(project)
    const unsubscribeLogs = subscribeLogsFilters(project)

    return () => {
      projection.cancel()
      unsubscribeDiffScope()
      unsubscribeRail()
      unsubscribeSelection()
      unsubscribeWorkspace()
      unsubscribeUi()
      unsubscribeSearch()
      unsubscribeLogs()
    }
  }, [passthrough, router, searchStoreApi, storeApi, uiStoreApi])
}

function snapshotFromStore(
  storeApi: EditorWorkspaceStoreApi,
  uiStoreApi: EditorUiStoreApi,
  searchStoreApi: SearchBufferStoreApi,
  passthrough: Record<string, string>,
) {
  const state = storeApi.getState()
  const rootPath = state.rootFolder?.path ?? null
  if (!rootPath) return { ...emptyAddressSnapshot(), passthrough }

  const panels = state.workbenchPanels
  const defaults = createDefaultWorkbenchPanels()

  return {
    ...emptyAddressSnapshot(),
    activeDocumentPath: activeEditorTabForWorkbenchPanels(panels)?.path ?? null,
    focus: focusFor(uiStoreApi, activeEditorTabForWorkbenchPanels(panels)?.path ?? null),
    bottomTab: orAbsent(panels.activeBottomTab, defaults.activeBottomTab),
    editorTabPaths: panels.editorTabs.map((tab) => tab.path),
    // From memory, never from storage. `readWorkspaceCache()` re-enumerates the whole
    // localStorage keyspace and re-parses every slice AND every search buffer — and
    // search buffers carry a materialized match list. Measured at 32 key enumerations
    // and 14 parses per single file click, on a path that runs on every store change.
    // `parkedWorkspaces` is the same remembered set, already in memory.
    knownRootPaths: [...state.parkedWorkspaces.keys(), rootPath],
    passthrough,
    mode: state.uiMode === 'chat' ? ('chat' as const) : ('workbench' as const),
    rootPath,
    railView: useSessionRailStore.getState().view === 'archived' ? ('archived' as const) : null,
    logs: logsParamsFor(readLogsFilters(), defaultLogsFilterState()),
    search: searchParamsFor(searchStoreApi.getState().active),
    sessionToken: sessionTokenFor(useSessionSelectionStore.getState().selection),
    threadDiffScope: threadDiffScopeParam(),
    settingsCategory: settingsCategoryOrNull(),
    sidebarTab: orAbsent(panels.activeSidebarTab, defaults.activeSidebarTab),
    toolTab: orAbsent(
      state.chatModePanels?.activeToolTab ?? null,
      createDefaultChatModePanels().activeToolTab,
    ),
  }
}

/**
 * The gutter counts from 1 and LSP counts from 0, so every value gains one on the way
 * out. Only the target for the document actually on screen is projected — a stale
 * target from a file you navigated away from is not where the link points.
 */
function focusFor(uiStoreApi: EditorUiStoreApi, activePath: string | null) {
  const target = uiStoreApi.getState().definitionTarget
  if (!target || !activePath || target.path !== activePath) return null

  const line = target.range.start.line + 1
  const endLine = target.range.end.line + 1

  return {
    column: target.range.start.character > 0 ? target.range.start.character + 1 : null,
    endLine: endLine > line ? endLine : null,
    line,
  }
}

/**
 * Only projected while a settings tab is actually open — the category store keeps its
 * pick after you close the tab, and a link that reopened settings because of a
 * remembered section would be the opposite of "an open menu is never a place".
 */
function settingsCategoryOrNull() {
  const category = readSettingsCategory()

  return category ? settingsCategorySlug(category) : null
}

/**
 * A slot sitting at its default is ABSENT from the address, not present-and-equal.
 * §1's rule is that an absent field defers to the remembered slice, so emitting the
 * default would make every shared link force the recipient's sidebar to `files` and
 * their bottom panel to `terminal` — panels they never chose.
 */
function orAbsent<T>(value: T | null, fallback: T) {
  return value === fallback ? null : value
}

/**
 * The scope of the thread on stage, not of every remembered thread. Only chat mode
 * shows it, and only the selected thread's pick is where the user is.
 */
function threadDiffScopeParam() {
  const selection = useSessionSelectionStore.getState().selection
  if (selection.kind !== 'session') return null

  const entry = useThreadDiffScopeStore.getState().scopeByThreadId[selection.threadId]

  return entry ? diffScopeParam(entry.scope) : null
}
