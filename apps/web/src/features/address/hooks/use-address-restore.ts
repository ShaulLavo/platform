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
import { isSettingsDocumentId } from '@/features/settings/settings-document'
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
import { isDirectoryEntry } from '@workspace/contracts'
import { toast } from 'sonner'

import { log } from '@/lib/client-logging'
import { fetchRecentEntries } from '@/lib/file-server'
import { readWorkspaceCache } from '@/lib/workspace-cache'

/**
 * The inbound edge for everything `addressedWorkspaceCache` could not decide.
 *
 * That merge runs before the stores exist and owns the slots a workspace slice can
 * hold — mode, panels, tabs, the active document — for the workspace already open. What
 * is left here is the rest: a cross-workspace switch, which needs a real `statPath`, and
 * the slots no slice holds at all (settings, search, logs, chat selection).
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

/**
 * Why the address is being applied, which decides two things a boot and a back press
 * must not share.
 *
 * `boot` may find the work already done: when the address names the workspace that is
 * already open, the provider's merge has seeded mode, panels and tabs, and re-applying
 * them would be redundant at best. `boot` also never CLOSES a tab, because the address
 * may be a link someone else wrote.
 *
 * `popstate` always applies in full and does close tabs, because there the tab set is
 * one this app wrote and back has to be the inverse of push.
 */
type ApplyReason = 'boot' | 'popstate'

/**
 * Everything worth knowing about one restore, accumulated so it can leave as a single
 * wide event. Applying an address used to emit up to four narrow lines — one per
 * rejected token, plus the tab cap, plus the slug warning, plus the outcome — which is
 * the shape the evlog rule exists to prevent: the pieces were only correlatable by
 * timestamp, and a boot that rejected three tokens looked like three unrelated faults.
 */
type ApplyTrace = {
  ambiguousSlugCandidates: number | null
  rejectedTokens: string[]
  tabsRejected: number | null
}

function emptyApplyTrace(): ApplyTrace {
  return { ambiguousSlugCandidates: null, rejectedTokens: [], tabsRejected: null }
}

export type AddressRestoreResult =
  | { readonly status: 'applied'; readonly reason: ApplyReason }
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
    const deps = { commands, documentStoreApi, openWorkspaceRoot, searchStoreApi, storeApi }
    if (!applied.current) {
      applied.current = true
      void applyAddress(deps, 'boot')
    }

    // The second inbound edge. `pushState`/`replaceState` do not emit `popstate`, so
    // the projection's own writes cannot echo back here — only a real back, forward,
    // mouse-back or trackpad swipe reaches this listener.
    function applyOnPopState() {
      void applyAddress(deps, 'popstate')
    }

    window.addEventListener('popstate', applyOnPopState)
    return () => window.removeEventListener('popstate', applyOnPopState)
  }, [commands, documentStoreApi, openWorkspaceRoot, searchStoreApi, storeApi])
}

async function applyAddress(
  {
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
  },
  reason: ApplyReason,
): Promise<AddressRestoreResult> {
  const trace = emptyApplyTrace()
  const address = parseAddress(window.location.href)
  if (!address.workspace) {
    return report({ status: 'pending', reason: 'no address to apply' }, trace)
  }
  // `/~-` names "no folder open", not "nothing to do": the settings overlay works
  // without a workspace, and returning early made every documented folderless address
  // a silent no-op.
  if (address.workspace === NO_WORKSPACE_SLUG) {
    applySettings(address, commands, storeApi)
    return report({ status: 'applied', reason }, trace)
  }

  const rootPath = await resolveRoot(address.workspace, storeApi, trace)
  if (!rootPath) {
    return report(
      {
        status: 'unavailable',
        reason: `no workspace named ${address.workspace} on this machine`,
      },
      trace,
    )
  }

  // Whether the provider's merge already seeded the slice slots. It only ever seeds the
  // workspace that was already open, so a switch below always leaves this false.
  const seeded = reason === 'boot' && storeApi.getState().rootFolder?.path === rootPath

  if (storeApi.getState().rootFolder?.path !== rootPath) {
    const outcome = await openWorkspaceRoot(rootPath)
    // `superseded` means another project switch won while this one was in flight.
    // Applying the rest would drag that project's tabs into the winner.
    if (outcome === 'superseded') {
      return report({ status: 'pending', reason: 'superseded' }, trace)
    }
    if (outcome === 'failed') {
      return report({ status: 'unavailable', reason: 'root failed to open' }, trace)
    }
  }

  if (!seeded) {
    applyMode(address.mode, storeApi)
    applyPanels(address, storeApi)
    if (address.mode === 'chat') applyChatToolTab(address, storeApi)
    applyTabs(address, rootPath, commands, storeApi, documentStoreApi, reason, trace)
  }

  // Before the document, always. `openSettingsEditor` selects the tab it opens, so
  // running it afterwards made which tab you land on depend on `?tabs=` byte order.
  applySettings(address, commands, storeApi)

  // Last, and NOT inside `applyTabs`: opening the tab set moves the selection, and an
  // address without `?tabs=` skips that step entirely — so a document re-select that
  // lived in there simply did not happen for short links, and back left the previous
  // document selected. One call, one place, after everything that can steal focus.
  if (address.mode !== 'chat') applyDocument(address, rootPath, commands, trace)

  // Always applied: none of these lives in a workspace slice, so the merge cannot
  // reach them however the address arrived.
  if (address.mode === 'chat') applyChatSelection(address, rootPath, trace)
  applySearch(address, rootPath, searchStoreApi)
  applyLogs(address)

  return report({ status: 'applied', reason }, trace)
}

/** Enough to cover a link to a project opened a while ago, without a slow round trip. */
const RECENT_DIRECTORY_LIMIT = 50

async function resolveRoot(
  slug: string,
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>,
  trace: ApplyTrace,
) {
  const current = storeApi.getState().rootFolder?.path
  const indexed = [...readWorkspaceCache().workspaceOrder, ...(current ? [current] : [])]
  const resolution = resolveWorkspaceSlug(slug, {
    indexed,
    // Only consulted when the index cannot answer — `resolveWorkspaceSlug` tries the
    // cheap local steps first — so a warm boot never pays for this round trip. Wiring
    // it is what lets a link reach a project this machine has on disk but has not
    // opened recently enough to still be in the eight-slot index.
    recent: await recentRootPaths(slug, indexed),
  })

  if (resolution.kind === 'resolved') return resolution.rootPath
  // Ambiguity is not a guess to make: two checkouts named the same thing are two
  // different workspaces, and picking one silently swaps the user's whole world.
  if (resolution.kind === 'ambiguous') trace.ambiguousSlugCandidates = resolution.rootPaths.length

  return null
}

/**
 * Skipped entirely when the index already holds the slug, so the common path stays
 * local and synchronous. A failure here is not a failed restore — it just means the
 * resolver falls back to what it already had.
 */
async function recentRootPaths(slug: string, indexed: readonly string[]) {
  if (resolveWorkspaceSlug(slug, { indexed }).kind !== 'unknown') return []

  try {
    const entries = await fetchRecentEntries(RECENT_DIRECTORY_LIMIT, new AbortController().signal)

    return entries.filter((entry) => isDirectoryEntry(entry)).map((entry) => entry.path)
  } catch {
    // Swallowed, not silent: `fs.recents` carries the failure as its own wide event.
    return []
  }
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
  trace: ApplyTrace,
) {
  const token = address.document
  if (!token) return

  const parsed = pathForDocumentToken(rootPath, token)
  if (parsed.kind !== 'path') {
    // Recorded rather than swallowed: a token that parses to nothing is otherwise a
    // blank tab with no error anywhere.
    trace.rejectedTokens.push('reason' in parsed ? parsed.reason : parsed.kind)
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
 * The chat thread on stage, plus the rail and diff scope that belong to it. None of
 * these lives in a workspace slice, so this runs however the address arrived.
 */
function applyChatSelection(
  address: ReturnType<typeof parseAddress>,
  rootPath: string,
  trace: ApplyTrace,
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
  if (parsed?.kind === 'rejected') trace.rejectedTokens.push('thread id')

  if (address.rail === 'archived') useSessionRailStore.getState().setView('archived')

  // Applied through the store's own action, and only for the thread the address names —
  // a scope belongs to a conversation, not to the window.
  const scope = diffScopeFor(address.diff)
  if (scope && parsed?.kind === 'session') {
    useThreadDiffScopeStore.getState().selectThreadDiffScope(parsed.threadId, scope)
  }
}

/**
 * `?tool=git` selects git and opens the pane exactly as clicking it would, without
 * `toolPaneOpen` ever being serialized. Only applied when it actually differs:
 * `showChatModeToolTab` forces the pane open, and re-applying the tab a user had
 * already collapsed would reopen it on every reload.
 */
function applyChatToolTab(
  address: ReturnType<typeof parseAddress>,
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>,
) {
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
 *
 * Symmetric, which it was not: with no `null` branch the slot was a one-way sink.
 * `selectSettingsCategory` has no other caller, so nothing in the UI could undo a
 * category a link had pinned, and backing out of settings left the tab open forever.
 */
function applySettings(
  address: ReturnType<typeof parseAddress>,
  commands: ReturnType<typeof useEditorCommands>,
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>,
) {
  if (address.settings === null) {
    closeSettingsTab(commands, storeApi)
    return
  }

  const categories = SETTING_IDS.map((id) => descriptorFor(id).category)
  selectSettingsCategory(
    address.settings ? settingsCategoryForSlug(address.settings, categories) : null,
  )
  commands.openSettingsEditor()
}

/**
 * The settings tab is addressed by the `?settings=` slot rather than a `?tabs=` token,
 * so `closeTabsOutsideAddress` cannot see it — which is why walking back out of
 * settings used to leave it open. Closing it here keeps the one slot that owns it
 * responsible for both directions.
 */
function closeSettingsTab(
  commands: ReturnType<typeof useEditorCommands>,
  storeApi: ReturnType<typeof useEditorWorkspaceStoreApi>,
) {
  const open = storeApi
    .getState()
    .workbenchPanels.editorTabs.find((tab) => isSettingsDocumentId(tab.path))
  if (!open) return

  selectSettingsCategory(null)
  commands.closeTab(open.id)
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
  reason: ApplyReason,
  trace: ApplyTrace,
) {
  if (!address.tabs?.length) return

  // Bounded on apply as well as on encode. The encoder caps what IT writes, which says
  // nothing about a hand-edited or hostile link: without this, `?tabs=` with 5000
  // tokens opens 5000 editor tabs in one synchronous loop.
  if (address.tabs.length > MAX_APPLIED_TABS) {
    trace.tabsRejected = address.tabs.length
    return
  }

  for (const token of address.tabs) {
    if (token === address.document) continue

    const parsed = pathForDocumentToken(rootPath, token)
    if (parsed.kind !== 'path') continue

    commands.openFileSurface(parsed.path)
  }

  // Only a back press closes tabs. On boot the address may be a link someone else
  // wrote, and a stranger's two-tab link is not an instruction to delete the ten tabs
  // you had open — the cache persistence would then write that deletion to disk 350ms
  // later, surviving the restart. Walking history is the only case where the tab set
  // is one this app wrote, and therefore the only case where absence means "close".
  if (reason === 'popstate') {
    closeTabsOutsideAddress(address.tabs, rootPath, commands, storeApi, documentStoreApi)
  }
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

/**
 * A dead link is the one failure the user has to be told about.
 *
 * Every other outcome degrades into something reasonable, but an address naming a
 * workspace this machine does not have silently lands the recipient on their own last
 * session — which looks exactly like the link having worked. The three-state result was
 * being computed and logged with nothing rendering it; this is the missing surface.
 */
function reportUnavailable(result: AddressRestoreResult) {
  if (result.status !== 'unavailable') return result

  toast.error('That link points somewhere this machine does not have', {
    description: result.reason,
  })

  return result
}

function report(result: AddressRestoreResult, trace: ApplyTrace) {
  log.info({
    action: 'address.restored',
    ambiguousSlugCandidates: trace.ambiguousSlugCandidates,
    area: 'address',
    reason: 'reason' in result ? result.reason : null,
    rejectedTokenCount: trace.rejectedTokens.length,
    rejectedTokenReasons: trace.rejectedTokens,
    status: result.status,
    tabsRejected: trace.tabsRejected,
  })

  return reportUnavailable(result)
}
