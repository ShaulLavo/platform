import { useEffect, useRef } from 'react'

import { parseAddress } from '@/features/address/utils/grammar'
import { pathForDocumentToken } from '@/features/address/utils/document-token'
import { resolveWorkspaceSlug, NO_WORKSPACE_SLUG } from '@/features/address/utils/slug'
import { parseSessionToken } from '@/features/address/utils/session-token'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { useThreadDiffScopeStore } from '@/features/chat/state/thread-diff-scope-store'
import { diffScopeFor } from '@/features/address/utils/diff-scope'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { showChatModeToolTab, isChatModeToolTab } from '@/features/chat-mode/utils/panels'
import { workspaceProjectId } from '@/features/chat/lib/chat-command-builders'
import { settingsCategoryForSlug } from '@/features/address/utils/settings-category'
import { selectSettingsCategory } from '@/features/settings/state/category-store'
import { SETTING_IDS, descriptorFor } from '@workspace/contracts'
import { searchStateFor } from '@/features/address/utils/search-params'
import { logsFiltersFor } from '@/features/address/utils/logs-params'
import { defaultLogsFilterState } from '@/features/logs/log-filter-params'
import { setLogsFilters } from '@/features/logs/state/filter-store'
import { useSearchBufferStoreApi } from '@/features/search/search-buffer-state'
import type { SearchBufferStoreApi } from '@/features/search/search-buffer-state'
import { useEditorCommands } from '@/features/editor/state/editor-commands'
import { useEditorDocumentStoreApi } from '@/features/editor/state/editor-document-state'
import { documentTokenForPath } from '@/features/address/utils/document-token'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/editor-workspace-state'
import { useOpenWorkspaceRoot } from '@/hooks/use-open-workspace-root'
import {
  setWorkbenchBottomTab,
  setWorkbenchSidebarTab,
} from '@/features/workbench/utils/workbench-panels'
import { log } from '@/lib/client-logging'
import { readWorkspaceCache } from '@/lib/workspace-cache'

/**
 * The single inbound edge. Runs once, at boot.
 *
 * Everything is applied through domain actions in slot order — workspace, mode,
 * document, panel — never through raw setters. Three consequences: the URL cannot
 * express invalid state; the applier inherits the existing supersede protocol rather
 * than competing with it (`useOpenWorkspaceRoot` still arbitrates which project
 * switch won); and panels go through the store's own setter, which normalizes, so the
 * store can never end up claiming a file is selected while the editor pane shows
 * nothing.
 *
 * Absent fields mean "defer to the remembered slice", never "reset to default", so a
 * short link lands somewhere sane instead of flattening everything it does not name.
 */
/** A link naming more tabs than a person could have opened is not a tab set. */
const MAX_APPLIED_TABS = 64

export type AddressRestoreResult =
  | { readonly status: 'applied' }
  | { readonly status: 'pending'; readonly reason: string }
  | { readonly status: 'unavailable'; readonly reason: string }

export function useAddressRestore() {
  const openWorkspaceRoot = useOpenWorkspaceRoot()
  const commands = useEditorCommands()
  const storeApi = useEditorWorkspaceStoreApi()
  const documentStoreApi = useEditorDocumentStoreApi()
  const searchStoreApi = useSearchBufferStoreApi()
  const applied = useRef(false)

  useEffect(() => {
    if (!applied.current) {
      applied.current = true
      void applyAddress({ commands, documentStoreApi, openWorkspaceRoot, searchStoreApi, storeApi })
    }

    // The second inbound edge. `pushState`/`replaceState` do not emit `popstate`, so
    // the projection's own writes cannot echo back here — only a real back, forward,
    // mouse-back or trackpad swipe reaches this listener.
    function applyOnPopState() {
      void applyAddress({ commands, documentStoreApi, openWorkspaceRoot, searchStoreApi, storeApi })
    }

    window.addEventListener('popstate', applyOnPopState)
    return () => window.removeEventListener('popstate', applyOnPopState)
  }, [commands, documentStoreApi, openWorkspaceRoot, searchStoreApi, storeApi])
}

async function applyAddress({
  commands,
  documentStoreApi,
  openWorkspaceRoot,
  searchStoreApi,
  storeApi,
}: {
  commands: ReturnType<typeof useEditorCommands>
  documentStoreApi: ReturnType<typeof useEditorDocumentStoreApi>
  openWorkspaceRoot: ReturnType<typeof useOpenWorkspaceRoot>
  searchStoreApi: SearchBufferStoreApi
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>
}): Promise<AddressRestoreResult> {
  const address = parseAddress(window.location.href)
  if (!address.workspace) return report({ status: 'pending', reason: 'no address to apply' })
  // `/~-` names "no folder open", not "nothing to do": the settings overlay works
  // without a workspace, and returning early made every documented folderless address
  // a silent no-op.
  if (address.workspace === NO_WORKSPACE_SLUG) {
    applySettings(address, commands)
    return report({ status: 'applied' })
  }

  const rootPath = await resolveRoot(address.workspace, storeApi)
  if (!rootPath) {
    return report({
      status: 'unavailable',
      reason: `no workspace named ${address.workspace} on this machine`,
    })
  }

  if (storeApi.getState().rootFolder?.path !== rootPath) {
    const outcome = await openWorkspaceRoot(rootPath)
    // `superseded` means another project switch won while this one was in flight.
    // Applying the rest would drag that project's tabs into the winner.
    if (outcome === 'superseded') return report({ status: 'pending', reason: 'superseded' })
    if (outcome === 'failed')
      return report({ status: 'unavailable', reason: 'root failed to open' })
  }

  applyMode(address.mode, storeApi)
  if (address.mode === 'chat') applyChat(address, rootPath, storeApi)
  else applyDocument(address, rootPath, commands)
  applyPanels(address, storeApi)
  applySettings(address, commands)
  applySearch(address, rootPath, searchStoreApi)
  applyLogs(address)
  applyTabs(address, rootPath, commands, storeApi, documentStoreApi)

  return report({ status: 'applied' })
}

async function resolveRoot(slug: string, storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>) {
  const current = storeApi.getState().rootFolder?.path
  const resolution = resolveWorkspaceSlug(slug, {
    indexed: [...readWorkspaceCache().workspaceOrder, ...(current ? [current] : [])],
  })

  if (resolution.kind === 'resolved') return resolution.rootPath
  // Ambiguity is not a guess to make: two checkouts named the same thing are two
  // different workspaces, and picking one silently swaps the user's whole world.
  if (resolution.kind === 'ambiguous') {
    log.warn({
      action: 'address.slug_ambiguous',
      area: 'address',
      candidates: resolution.rootPaths.length,
      slug,
    })
  }

  return null
}

function applyMode(
  mode: ReturnType<typeof parseAddress>['mode'],
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>,
) {
  if (!mode) return

  storeApi.getState().setUiMode(mode)
}

function applyDocument(
  address: ReturnType<typeof parseAddress>,
  rootPath: string,
  commands: ReturnType<typeof useEditorCommands>,
) {
  const token = address.document
  if (!token) return

  const parsed = pathForDocumentToken(rootPath, token)
  if (parsed.kind !== 'path') {
    // Logged rather than swallowed: a token that parses to nothing is otherwise a
    // blank tab with no error anywhere.
    log.warn({
      action: 'address.token_rejected',
      area: 'address',
      reason: 'reason' in parsed ? parsed.reason : parsed.kind,
      token,
    })
    return
  }

  // `openDefinition` opens the path AND sets the target the editor scrolls to, so a
  // focused link is one call rather than an open followed by a racing scroll.
  if (address.focus) {
    commands.openDefinition(definitionTargetFor(parsed.path, address.focus))
    return
  }

  commands.openFileSurface(parsed.path)
}

/**
 * `#L484`, `#L21,9`, `#L484-L520` are 1-based, the way an editor gutter counts.
 * LSP positions are 0-based, so every value loses one on the way in.
 */
function definitionTargetFor(
  path: string,
  focus: NonNullable<ReturnType<typeof parseAddress>['focus']>,
) {
  const line = Math.max(0, focus.line - 1)
  const character = Math.max(0, (focus.column ?? 1) - 1)
  const endLine = focus.endLine ? Math.max(line, focus.endLine - 1) : line

  return {
    path,
    range: {
      end: { character: focus.endLine ? 0 : character, line: endLine },
      start: { character, line },
    },
    uri: `file://${path.startsWith('/') ? path : `/${path}`}`,
  }
}

/**
 * Chat slots, applied through the same domain actions a click goes through — so
 * `?tool=git` selects git and opens the pane exactly as clicking it would, without
 * `toolPaneOpen` ever being serialized. The tab is only shown when it actually
 * differs: `showChatModeToolTab` forces the pane open, and re-applying the tab a
 * user had already collapsed would reopen it on every reload.
 */
function applyChat(
  address: ReturnType<typeof parseAddress>,
  rootPath: string,
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>,
) {
  const parsed = parseSessionToken(address.document)
  if (parsed?.kind === 'session') {
    useSessionSelectionStore
      .getState()
      .restoreSession(workspaceProjectId(rootPath), parsed.threadId)
  }
  if (parsed?.kind === 'draft') {
    useSessionSelectionStore.getState().startDraft(workspaceProjectId(rootPath))
  }
  if (parsed?.kind === 'rejected') {
    log.warn({
      action: 'address.token_rejected',
      area: 'address',
      reason: 'thread id',
      token: address.document,
    })
  }

  if (address.rail === 'archived') useSessionRailStore.getState().setView('archived')

  // Applied through the store's own action, and only for the thread the address names —
  // a scope belongs to a conversation, not to the window.
  const scope = diffScopeFor(address.diff)
  if (scope && parsed?.kind === 'session') {
    useThreadDiffScopeStore.getState().selectThreadDiffScope(parsed.threadId, scope)
  }

  const state = storeApi.getState()
  const panels = state.chatModePanels
  if (!address.tool || !isChatModeToolTab(address.tool)) return
  if (panels.activeToolTab === address.tool) return

  state.setChatModePanels(showChatModeToolTab(panels, address.tool))
}

function applyPanels(
  address: ReturnType<typeof parseAddress>,
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>,
) {
  const state = storeApi.getState()
  let panels = state.workbenchPanels

  if (address.side) panels = setWorkbenchSidebarTab(panels, address.side)
  if (address.bottom) panels = setWorkbenchBottomTab(panels, address.bottom)
  if (panels === state.workbenchPanels) return

  state.setWorkbenchPanels(panels)
}

/**
 * A param rather than a route, deliberately: a real `/settings` route would unmount
 * the workspace behind it, killing live terminal sockets and editor DOM. The empty
 * string means "settings, no category" — the page opens showing everything.
 */
function applySettings(
  address: ReturnType<typeof parseAddress>,
  commands: ReturnType<typeof useEditorCommands>,
) {
  if (address.settings === null) return

  const categories = SETTING_IDS.map((id) => descriptorFor(id).category)
  selectSettingsCategory(
    address.settings ? settingsCategoryForSlug(address.settings, categories) : null,
  )
  commands.openSettingsEditor()
}

/**
 * Query and flags only. Results are not restored — they re-run, which is the whole
 * reason they are not in the address — and `replaceText` has no field to restore
 * from.
 */
function applySearch(
  address: ReturnType<typeof parseAddress>,
  rootPath: string,
  searchStoreApi: SearchBufferStoreApi,
) {
  const wanted = searchStateFor(address.search)
  if (!wanted?.query) return

  const store = searchStoreApi.getState()
  store.prepareBuffer(rootPath)
  store.setSearchOptions(rootPath, {
    caseSensitive: wanted.caseSensitive,
    excludeGlobText: wanted.excludeGlobText,
    filtersVisible: Boolean(wanted.includeGlobText || wanted.excludeGlobText),
    includeGlobText: wanted.includeGlobText,
    matchMode: wanted.matchMode as never,
    wholeWord: wanted.wholeWord,
  })
  store.setQuery(rootPath, wanted.query)
}

function applyLogs(address: ReturnType<typeof parseAddress>) {
  const filters = logsFiltersFor(address.logs, defaultLogsFilterState())
  if (!filters) return

  setLogsFilters(filters)
}

/**
 * Opened before the active document so the active one ends up selected. Tokens that
 * do not parse are skipped one at a time — a stale entry costs its own tab and
 * nothing else.
 */
function applyTabs(
  address: ReturnType<typeof parseAddress>,
  rootPath: string,
  commands: ReturnType<typeof useEditorCommands>,
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>,
  documentStoreApi: ReturnType<typeof useEditorDocumentStoreApi>,
) {
  if (!address.tabs?.length) return

  // Bounded on apply as well as on encode. The encoder caps what IT writes, which says
  // nothing about a hand-edited or hostile link: without this, `?tabs=` with 5000
  // tokens opens 5000 editor tabs in one synchronous loop.
  if (address.tabs.length > MAX_APPLIED_TABS) {
    log.warn({
      action: 'address.tabs_rejected',
      area: 'address',
      limit: MAX_APPLIED_TABS,
      tabCount: address.tabs.length,
    })
    return
  }

  for (const token of address.tabs) {
    if (token === address.document) continue

    const parsed = pathForDocumentToken(rootPath, token)
    if (parsed.kind !== 'path') continue

    commands.openFileSurface(parsed.path)
  }

  closeTabsOutsideAddress(address.tabs, rootPath, commands, storeApi, documentStoreApi)

  // Re-select the active document, because opening the rest moved the selection — but
  // only when the document slot actually holds one. In chat mode it holds a `t/` thread
  // token, which is not a workspace document: re-applying it logged a false
  // `token_rejected` and left the wrong workbench tab selected.
  if (address.mode === 'chat') return

  applyDocument(address, rootPath, commands)
}

/**
 * Makes back the inverse of push. Without this the applier only ever ADDED tabs, so
 * walking history moved the selection while every tab you had ever opened stayed put.
 *
 * Two kinds are deliberately never closed. A tab with no token — a conflict diff, a
 * document outside the workspace — was never representable in `?tabs=`, so its absence
 * from the set means nothing. And a tab with unsaved edits is never closed silently:
 * the address is not worth someone's work.
 */
function closeTabsOutsideAddress(
  tokens: readonly string[],
  rootPath: string,
  commands: ReturnType<typeof useEditorCommands>,
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>,
  documentStoreApi: ReturnType<typeof useEditorDocumentStoreApi>,
) {
  const wanted = new Set(tokens)
  const dirty = documentStoreApi.getState().dirtyFilePaths

  for (const tab of storeApi.getState().workbenchPanels.editorTabs) {
    const token = documentTokenForPath(rootPath, tab.path)
    if (token.kind !== 'token') continue
    if (wanted.has(token.token)) continue
    if (dirty.has(tab.path)) continue

    commands.closeTab(tab.id)
  }
}

function report(result: AddressRestoreResult) {
  log.info({
    action: 'address.restored',
    area: 'address',
    reason: 'reason' in result ? result.reason : null,
    status: result.status,
  })

  return result
}
