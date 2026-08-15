import type { Address } from '@/features/address/utils/grammar'
import { log } from '@/lib/client-logging'
import { documentTokenForPath } from '@/features/address/utils/document-token'
import { emptyAddress } from '@/features/address/utils/grammar'
import { NO_WORKSPACE_SLUG, workspaceSlug } from '@/features/address/utils/slug'
import { isSettingsDocumentId } from '@/features/settings/settings-document'

/**
 * The narrow record the encoder takes, instead of a store.
 *
 * This is half of what makes the deny-list structural. `Address` is a `strictObject`
 * with no field for a dangerous value; `AddressSnapshot` is a hand-written record with
 * no field to read one FROM. The terminal command inbox and the composer inbox are
 * `take`-once queues — a URL that replayed one would run a shell command or inject
 * prompt text on page load — and neither store is reachable from here.
 *
 * Every field is what the user is looking at, never how it is drawn: no pane
 * percentages, no theme, no scroll offsets, no open/closed chrome booleans.
 */
export type AddressSnapshot = {
  readonly activeDocumentPath: string | null
  readonly bottomTab: Address['bottom']
  readonly editorTabPaths: readonly string[]
  readonly focus: Address['focus']
  /** Every remembered root, so a slug can be made distinct from its neighbours. */
  readonly knownRootPaths: readonly string[]
  readonly mode: Address['mode']
  /** Unowned search keys observed at boot, carried so a rewrite cannot drop them. */
  readonly passthrough: Readonly<Record<string, string>>
  readonly railView: Address['rail']
  readonly rootPath: string | null
  readonly settingsCategory: string | null
  /**
   * Chat mode's thread, as a token: `t/<threadId>`, `t/new`, or absent for an
   * auto-pick. Chat mode's selection only — the workbench sidebar's chat tab keeps
   * its own unpersisted pick, and addressing both would make `t/` ambiguous about
   * which surface it targets.
   */
  readonly sessionToken: string | null
  /** `s.*` — query and flags only. `replaceText` has no field here, by construction. */
  readonly search: Readonly<Record<string, string>> | null
  /** `log.*` — the dashboard's filters. */
  readonly logs: Readonly<Record<string, string>> | null
  readonly sidebarTab: Address['side']
  readonly threadDiffScope: string | null
  readonly toolTab: string | null
}

export function emptyAddressSnapshot(): AddressSnapshot {
  return {
    activeDocumentPath: null,
    bottomTab: null,
    editorTabPaths: [],
    focus: null,
    knownRootPaths: [],
    mode: null,
    passthrough: {},
    railView: null,
    rootPath: null,
    logs: null,
    search: null,
    sessionToken: null,
    settingsCategory: null,
    sidebarTab: null,
    threadDiffScope: null,
    toolTab: null,
  }
}

/**
 * Snapshot to `Address`. Documents that cannot be encoded — a conflict diff, anything
 * outside the workspace — simply produce no token, so the encoder cannot leak them
 * even by accident. A settings tab becomes the overlay slot rather than a tab token,
 * because settings is addressed as `?settings=` and never as a route.
 */
export function addressFromSnapshot(snapshot: AddressSnapshot): Address {
  // Passthrough survives even here: with no folder open there is nothing else to
  // name, but the dev params still have to reach the code that reads them.
  if (!snapshot.rootPath) {
    return {
      ...emptyAddress(),
      passthrough: { ...snapshot.passthrough },
      workspace: NO_WORKSPACE_SLUG,
    }
  }

  const rootPath = snapshot.rootPath
  const active = snapshot.activeDocumentPath
    ? documentTokenForPath(rootPath, snapshot.activeDocumentPath)
    : null

  return {
    ...emptyAddress(),
    bottom: snapshot.bottomTab,
    diff: snapshot.threadDiffScope,
    document: snapshot.mode === 'chat' ? snapshot.sessionToken : documentToken(active),
    focus: snapshot.focus,
    mode: snapshot.mode,
    passthrough: { ...snapshot.passthrough },
    logs: snapshot.logs ? { ...snapshot.logs } : null,
    rail: snapshot.railView,
    search: snapshot.search ? { ...snapshot.search } : null,
    settings: settingsCategory(snapshot, active),
    side: snapshot.sidebarTab,
    tabs: tabTokens(rootPath, snapshot.editorTabPaths),
    tool: snapshot.toolTab,
    workspace: workspaceSlug(rootPath, [...snapshot.knownRootPaths, rootPath]),
  }
}

/**
 * Driven by whether a settings tab is actually OPEN, not by the category store.
 * That store keeps its pick after the tab closes, so reading it directly left
 * `?settings=` in the URL forever and reopened the page on every reload — the exact
 * "an open menu is never a place" failure the classification table warns about.
 *
 * The tab set is checked too, not just the active document: settings can sit in a
 * background tab, and that is still open.
 */
function settingsCategory(
  snapshot: AddressSnapshot,
  active: ReturnType<typeof documentTokenForPath> | null,
) {
  const open =
    active?.kind === 'overlay' || snapshot.editorTabPaths.some((path) => isSettingsDocumentId(path))
  if (!open) return null

  return snapshot.settingsCategory ?? ''
}

/**
 * Over budget, `tabs` is dropped ENTIRELY and never truncated: a partial tab set
 * would delete tabs on apply. The path still names the active document, so the link
 * degrades to something useful rather than to something wrong.
 */
const TABS_BUDGET_BYTES = 1500

function tabTokens(rootPath: string, paths: readonly string[]) {
  const tokens = paths
    .map((path) => documentTokenForPath(rootPath, path))
    .flatMap((result) => (result.kind === 'token' ? [result.token] : []))
  if (tokens.length === 0) return null

  const bytes = tokens.join('~').length
  if (bytes <= TABS_BUDGET_BYTES) return tokens

  log.warn({
    action: 'address.tabs_omitted',
    area: 'address',
    bytes,
    tabCount: tokens.length,
  })
  return null
}

function documentToken(active: ReturnType<typeof documentTokenForPath> | null) {
  return active?.kind === 'token' ? active.token : null
}
