import {
  parseSearchBufferDocumentId,
  searchBufferDocumentLabel,
  searchBufferDocumentTitle,
} from '@/features/search/utils/buffer-document'
import { commandShortcut } from '@/keymap/utils/format-keys'
import type { EditorWorkspaceStoreApi } from '@/features/editor/state/workspace-state'
import { activeEditorTabForWorkbenchPanels } from '@/features/workbench/utils/panels'
import { parseCompareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { parseDiffDocumentId } from '@/features/git/utils/diff-document'
import { isFileEntry } from '@/lib/file-system-types'
import type { CommandInvocation, CommandOutcome } from '@/keymap/state/command-bus'
import type { OpenWorkspaceRootResult } from '@/features/workspace/hooks/use-open-root'
import type {
  FocusDestination,
  FocusTargetToken,
  FocusTransitionOutcome,
} from '@/lib/focus/state/service'
import { matchesActiveSurface } from '@/lib/focus/utils/active-surface'
import type { LoadState } from '@/lib/load-state'
import { basename, displayPath, toTreePath } from '@/lib/path-formatters'
import type { TreeModel } from '@/lib/tree-model'
import type { CommandSpec } from '@/keymap/command-registry'
import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'
import { fuzzyRankScore } from '@workspace/contracts'

import {
  colorModePaletteItems,
  hiddenCommandPaletteCommands,
  paletteModeCommands,
} from '@/features/command-palette/command-palette-data'
import type {
  ColorModePaletteItem,
  CommandPaletteItem,
  EditorPaletteItem,
  FilePaletteItem,
  QuickAccessMode,
  QuickOpenFileMatch,
} from '@/features/command-palette/command-palette-types'

/** Chat sessions have no path and no file icon, so they need a prefix of their own. */
const SCRIPT_PREFIX = 'run '
const SESSION_PREFIX = 'sess '

export function commandPaletteItems(
  specs: readonly CommandSpec[],
  bindings: readonly PlatformKeyBinding[],
): readonly CommandPaletteItem[] {
  return specs
    .filter((spec) => !hiddenCommandPaletteCommands.has(spec.id))
    .map((spec) => platformCommandPaletteItem(spec, bindings))
}

export const RECENTLY_USED_COMMANDS_HEADING = 'Recently Used'
export const OTHER_COMMANDS_HEADING = 'Other Commands'
const ALL_COMMANDS_HEADING = 'Commands'
/**
 * How many recents lead the unfiltered list. Enough that what you just ran is one
 * glance away, few enough that the categories underneath are still reachable without
 * typing — a recents group tall enough to fill the list would bury them.
 */
const RECENTLY_USED_COMMANDS_SHOWN = 6

export function groupedCommandItems(
  items: readonly CommandPaletteItem[],
  search = '',
  recentCommandIds: readonly string[] = [],
): readonly (readonly [string, readonly CommandPaletteItem[]])[] {
  const query = quickAccessQuery(search)
  const recency = recencyRankByCommandId(recentCommandIds)
  if (query) return searchedCommandGroups(rankedCommandItems(items, query), recency)

  return recentCommandsFirstGroups(items, recency)
}

function recencyRankByCommandId(recentCommandIds: readonly string[]): ReadonlyMap<string, number> {
  return new Map(recentCommandIds.map((commandId, rank) => [commandId, rank]))
}

function commandRecencyRank(item: CommandPaletteItem, recency: ReadonlyMap<string, number>) {
  return recency.get(item.id) ?? Number.MAX_SAFE_INTEGER
}

/**
 * With no query the palette is a menu, and the useful default for a menu is what
 * you reached for last. Recents lead; everything else keeps its category order
 * underneath, minus the ones already promoted so no command is listed twice.
 */
function recentCommandsFirstGroups(
  items: readonly CommandPaletteItem[],
  recency: ReadonlyMap<string, number>,
): readonly (readonly [string, readonly CommandPaletteItem[]])[] {
  const recent = items
    .filter((item) => recency.has(item.id))
    .toSorted(
      (left, right) => commandRecencyRank(left, recency) - commandRecencyRank(right, recency),
    )
    .slice(0, RECENTLY_USED_COMMANDS_SHOWN)
  if (recent.length === 0) return groupedCommandItemsInOrder(items)

  const promoted = new Set(recent.map((item) => item.id))

  return [
    [RECENTLY_USED_COMMANDS_HEADING, recent] as const,
    ...groupedCommandItemsInOrder(items.filter((item) => !promoted.has(item.id))),
  ]
}

/**
 * A query narrows which commands are on offer; it does not change which of them you
 * reach for. So the matches you have run before lead, newest first, and the rest follow
 * by match quality. Both halves are already filtered by the query, so leading with
 * recents can only promote something the user just asked for.
 *
 * Categories are dropped here on purpose: re-bucketing a globally ranked list by
 * category scatters that ranking across headings, which is how the best match ended up
 * below a worse one.
 */
function searchedCommandGroups(
  ranked: readonly CommandPaletteItem[],
  recency: ReadonlyMap<string, number>,
): readonly (readonly [string, readonly CommandPaletteItem[]])[] {
  const recent = ranked
    .filter((item) => recency.has(item.id))
    .toSorted(
      (left, right) => commandRecencyRank(left, recency) - commandRecencyRank(right, recency),
    )
  if (recent.length === 0) return [[ALL_COMMANDS_HEADING, ranked] as const]

  const rest = ranked.filter((item) => !recency.has(item.id))
  if (rest.length === 0) return [[RECENTLY_USED_COMMANDS_HEADING, recent] as const]

  return [
    [RECENTLY_USED_COMMANDS_HEADING, recent] as const,
    [OTHER_COMMANDS_HEADING, rest] as const,
  ]
}

function groupedCommandItemsInOrder(
  items: readonly CommandPaletteItem[],
): readonly (readonly [string, readonly CommandPaletteItem[]])[] {
  const groups = new Map<string, CommandPaletteItem[]>()
  for (const item of items) {
    const group = groups.get(item.category)
    if (group) {
      group.push(item)
      continue
    }

    groups.set(item.category, [item])
  }

  return Array.from(groups.entries())
}

type RankedCommandItem = {
  readonly item: CommandPaletteItem
  readonly order: number
  readonly score: number
  readonly strong: boolean
}

function rankedCommandItems(items: readonly CommandPaletteItem[], query: string) {
  const ranked = items.flatMap((item, order) => rankedCommandItem(item, query, order))
  const hasStrongMatch = ranked.some((item) => item.strong)

  return ranked
    .filter((item) => !hasStrongMatch || item.strong)
    .toSorted(compareRankedCommandItems)
    .map((item) => item.item)
}

function rankedCommandItem(item: CommandPaletteItem, query: string, order: number) {
  const score = quickAccessFilter(item.id, query, item.keywords)
  if (score <= 0) return []

  return [{ item, order, score, strong: commandItemStrongMatch(item, query) }]
}

function commandItemStrongMatch(item: CommandPaletteItem, query: string) {
  const pieces = queryPieces(query)
  if (pieces.length === 0) return true

  return pieces.every((piece) => commandItemMatchesPiece(item, piece))
}

function commandItemMatchesPiece(item: CommandPaletteItem, piece: string) {
  return item.keywords.some((keyword) => keyword.toLocaleLowerCase().includes(piece))
}

// Recency is applied a level up, by splitting these into recent and not, so the only
// job left here is match quality — with registry order settling what the score cannot.
function compareRankedCommandItems(left: RankedCommandItem, right: RankedCommandItem) {
  return compareNumbers(right.score, left.score) || compareNumbers(left.order, right.order)
}

export function filePaletteItems(state: LoadState<TreeModel>): readonly FilePaletteItem[] {
  if (state.status !== 'ready') return []

  return state.data.paths.flatMap((treePath) => {
    const entry = state.data.entriesByTreePath.get(treePath.replace(/\/$/, ''))
    if (!entry || !isFileEntry(entry)) return []

    return [{ entry, pathLabel: treePath }]
  })
}

export function searchFilePaletteItems(
  matches: readonly QuickOpenFileMatch[],
  rootPath: string,
): readonly FilePaletteItem[] {
  return matches.map((match) => ({
    entry: {
      birthtimeMs: match.birthtimeMs ?? 0,
      mtimeMs: match.mtimeMs ?? 0,
      name: basename(match.path),
      path: match.path,
      size: match.size ?? 0,
      targetType: match.targetType,
      type: match.type,
      version: searchEntryVersion(match.mtimeMs ?? 0, match.size ?? 0),
    },
    pathLabel: toTreePath(match.path, rootPath),
  }))
}

export function selectedFileCommandValue(
  selectedValue: string | null,
  items: readonly FilePaletteItem[],
) {
  const firstValue = items[0] ? fileItemValue(items[0]) : undefined
  if (!selectedValue) return firstValue
  if (items.some((item) => fileItemValue(item) === selectedValue)) return selectedValue

  return firstValue
}

export function fileItemValue(item: FilePaletteItem) {
  return `file:${item.entry.path}`
}

export function editorPaletteItems(
  openFilePaths: readonly string[],
  selectedFilePath: string | null,
): readonly EditorPaletteItem[] {
  return openFilePaths.map((path) => editorPaletteItem(path, selectedFilePath))
}

function editorPaletteItem(path: string, selectedFilePath: string | null): EditorPaletteItem {
  const searchBuffer = parseSearchBufferDocumentId(path)
  if (searchBuffer) {
    return {
      active: path === selectedFilePath,
      name: searchBufferDocumentLabel(),
      path,
      pathLabel: searchBufferDocumentTitle(searchBuffer.rootPath),
    }
  }

  return {
    active: path === selectedFilePath,
    name: basename(path),
    path,
    pathLabel: displayPath(path),
  }
}

function commandKeywords(spec: CommandSpec) {
  return [
    spec.title,
    spec.category,
    spec.description ?? '',
    spec.id,
    ...(spec.aliases ?? []),
    ...(spec.vscodeCommandIds ?? []),
  ]
}

export function quickAccessMode(search: string): QuickAccessMode {
  if (search.startsWith('view ')) return 'views'
  if (search.startsWith('color ')) return 'colorMode'
  if (search.startsWith('theme ')) return 'colorTheme'
  if (search.startsWith('edt ')) return 'editors'
  if (search.startsWith(SCRIPT_PREFIX)) return 'scripts'
  if (search.startsWith(SESSION_PREFIX)) return 'sessions'
  if (search.startsWith('@')) return 'symbols'
  if (search.startsWith(':')) return 'gotoLine'
  return search.startsWith('>') ? 'commands' : 'files'
}

export function isColorPreviewMode(mode: QuickAccessMode): boolean {
  return mode === 'colorMode' || mode === 'colorTheme'
}

/**
 * Modes whose rows arrive already filtered and already ordered — commands by recency
 * then match, files by the search server's own rank.
 *
 * cmdk re-sorts the rendered list by its own match score whenever it filters, and it
 * re-sorts groups by their best-scoring row. For these two that is not a second opinion
 * but a silent override: it would drop a just-used command back below a better textual
 * match, which is the whole thing recency exists to prevent.
 */
export function paletteOwnsItemOrder(mode: QuickAccessMode) {
  return mode === 'commands' || mode === 'files'
}

export function quickAccessQuery(search: string) {
  if (search.startsWith('view ')) return search.slice(5).trimStart()
  if (search.startsWith('color ')) return search.slice(6).trimStart()
  if (search.startsWith('theme ')) return search.slice(6).trimStart()
  if (search.startsWith('edt ')) return search.slice(4).trimStart()
  if (search.startsWith(SCRIPT_PREFIX)) return search.slice(SCRIPT_PREFIX.length).trimStart()
  if (search.startsWith(SESSION_PREFIX)) return search.slice(SESSION_PREFIX.length).trimStart()
  if (search.startsWith('@')) return search.slice(1).trimStart()
  if (search.startsWith(':')) return search.slice(1).trimStart()
  if (!search.startsWith('>')) return search

  return search.slice(1).trimStart()
}

export function quickAccessFilter(value: string, search: string, keywords?: readonly string[]) {
  return scopedPaletteFilter(value, quickAccessQuery(search), keywords)
}

/** The same ranking, for a scope whose input holds the bare query and no prefix. */
export function scopedPaletteFilter(value: string, search: string, keywords?: readonly string[]) {
  if (!search) return 1

  return fuzzyRankScore(quickAccessRankTarget(value, keywords), search)
}

/**
 * The mode a command-opened prefix pushes the palette into, or `null` for the two
 * root modes, whose prefix belongs in the input because the user types it there.
 *
 * A sub-picker holds its mode outside the input instead: leaving `theme ` in the box
 * meant the first Backspace turned it into `theme`, which is no prefix at all, and the
 * picker vanished mid-word.
 */
export function paletteScopeForPrefix(prefix: string): QuickAccessMode | null {
  const mode = quickAccessMode(prefix)
  if (mode === 'commands' || mode === 'files') return null

  return mode
}

export function scopeLabelForMode(mode: QuickAccessMode) {
  if (mode === 'views') return 'View'
  if (mode === 'colorMode') return 'Color Mode'
  if (mode === 'colorTheme') return 'Color Theme'
  if (mode === 'editors') return 'Open Editor'
  if (mode === 'scripts') return 'Script'
  if (mode === 'sessions') return 'Session'
  if (mode === 'symbols') return 'Go to Symbol'
  if (mode === 'gotoLine') return 'Go to Line'

  return 'Commands'
}

export function emptyLabelForMode(mode: QuickAccessMode) {
  if (mode === 'commands') return 'No matching commands'
  if (mode === 'views') return 'No matching views'
  if (mode === 'colorMode') return 'No matching color modes'
  if (mode === 'colorTheme') return 'No matching color themes'
  if (mode === 'editors') return 'No open editors'
  if (mode === 'sessions') return 'No matching sessions'
  if (mode === 'symbols') return 'No matching symbols'

  return 'No matching files'
}

export function placeholderForMode(mode: QuickAccessMode) {
  if (mode === 'commands') return 'Search commands…'
  if (mode === 'views') return 'Search views…'
  // Both preview live on the highlighted row, so say what the arrow keys do.
  if (mode === 'colorMode') return 'Select a color mode (up/down keys to preview)…'
  if (mode === 'colorTheme') return 'Select a color theme (up/down keys to preview)…'
  if (mode === 'editors') return 'Search open editors…'
  if (mode === 'scripts') return 'Search project scripts…'
  if (mode === 'sessions') return 'Search sessions, or start one in a project…'
  if (mode === 'symbols') return 'Search symbols in the active editor…'
  if (mode === 'gotoLine') return 'Go to line and column…'

  return 'Search files, > for commands, sess for sessions…'
}

/**
 * Title first, project second — `quickAccessRankTarget` reads those two slots as the
 * label and the path, which is what makes "footer" beat a project called "footers".
 */
export function sessionPaletteKeywords(session: {
  readonly branch: string | null
  readonly projectTitle: string
  readonly title: string
}) {
  return [session.title, session.projectTitle, session.branch ?? '']
}

export function sessionItemValue(sessionId: string) {
  return `session:${sessionId}`
}

const COLOR_THEME_VALUE_PREFIX = 'color-theme:'

export function colorThemeItemValue(themeId: string) {
  return `${COLOR_THEME_VALUE_PREFIX}${themeId}`
}

/** The theme behind a highlighted palette row, or `null` if the row is not one. */
export function colorThemeIdFromItemValue(value: string): string | null {
  if (!value.startsWith(COLOR_THEME_VALUE_PREFIX)) return null

  return value.slice(COLOR_THEME_VALUE_PREFIX.length) || null
}

/** The color mode behind a highlighted palette row, or `null` if the row is not one. */
export function colorModeItemForValue(value: string): ColorModePaletteItem | null {
  return colorModePaletteItems.find((item) => item.value === value) ?? null
}

export function previewColorModeItem(
  value: string,
  preview: (mode: ColorModePaletteItem['mode']) => void,
) {
  const item = colorModeItemForValue(value)
  if (!item) return false

  preview(item.mode)
  return true
}

const HIGHLIGHT_NAVIGATION_KEYS: ReadonlySet<string> = new Set([
  'ArrowDown',
  'ArrowUp',
  'End',
  'Home',
])

export function isHighlightNavigationKey(event: {
  readonly ctrlKey: boolean
  readonly key: string
}) {
  if (HIGHLIGHT_NAVIGATION_KEYS.has(event.key)) return true
  if (!event.ctrlKey) return false

  return event.key === 'j' || event.key === 'k' || event.key === 'n' || event.key === 'p'
}

export function sessionProjectItemValue(projectId: string) {
  return `session-project:${projectId}`
}

export function commandKeepsPaletteOpen(command: PlatformCommandId) {
  return paletteModeCommands.has(command)
}

export function paletteCommandInvocation(origin: FocusTargetToken | null): CommandInvocation {
  return { origin, source: { kind: 'palette' } }
}

export function paletteCommandSucceeded(outcome: CommandOutcome) {
  return outcome.status === 'handled' || outcome.status === 'deferred'
}

export function focusTransitionAcknowledged(outcome: FocusTransitionOutcome) {
  return outcome.status === 'acknowledged'
}

export function workspaceRootOpened(outcome: OpenWorkspaceRootResult) {
  return outcome === 'already-open' || outcome === 'opened'
}

export function activeEditorFocusDestination(
  workspace: EditorWorkspaceStoreApi,
): FocusDestination | null {
  const workspaceState = workspace.getState()
  const activeTab = activeEditorTabForWorkbenchPanels(workspaceState.workbenchPanels)
  if (!activeTab) return null
  const layout = workspaceState.uiMode

  const diffPath =
    parseCompareSavedDocumentId(activeTab.path) ?? parseDiffDocumentId(activeTab.path)?.path ?? null
  const searchRoot = parseSearchBufferDocumentId(activeTab.path)?.rootPath ?? null
  const identity = { diffPath, layout, searchRoot, tabId: activeTab.id } as const

  return {
    isValid: () => {
      const current = activeEditorTabForWorkbenchPanels(workspace.getState().workbenchPanels)
      return (
        workspace.getState().uiMode === layout &&
        current?.id === activeTab.id &&
        current.path === activeTab.path
      )
    },
    kind: 'match',
    matches: (target) => matchesActiveSurface(target, identity),
  }
}

export function symbolDescription(symbol: { containerName: string | null; kind: number }) {
  const kind = symbolKindLabel(symbol.kind)
  if (!symbol.containerName) return kind

  return `${kind} in ${symbol.containerName}`
}

export function symbolKindLabel(kind: number) {
  if (kind === 5) return 'Class'
  if (kind === 6) return 'Method'
  if (kind === 7) return 'Property'
  if (kind === 10) return 'Enum'
  if (kind === 11) return 'Interface'
  if (kind === 12) return 'Function'
  if (kind === 13) return 'Variable'

  return 'Symbol'
}

export function fileUriForPath(path: string) {
  const normalized = path.replace(/^\/+/, '')
  return `file:///${normalized.split('/').map(encodeURIComponent).join('/')}`
}

function searchEntryVersion(mtimeMs: number, size: number) {
  return `search:${mtimeMs}:${size}`
}

function platformCommandPaletteItem(
  spec: CommandSpec,
  bindings: readonly PlatformKeyBinding[],
): CommandPaletteItem {
  return {
    aliases: spec.aliases ?? [],
    category: spec.category,
    command: { command: spec.id, kind: 'platform' },
    description: spec.description,
    id: spec.id,
    keywords: commandKeywords(spec),
    shortcut: commandShortcut(spec.id, bindings),
    title: spec.title,
  }
}

function quickAccessRankTarget(value: string, keywords: readonly string[] | undefined) {
  const label = keywords?.[0] ?? value
  const path = keywords?.[1] ?? value
  const extraKeywords = [value].concat(keywords?.slice(2) ?? [])

  return { label, keywords: extraKeywords, path }
}

function queryPieces(query: string) {
  return query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean)
}

function compareNumbers(left: number, right: number) {
  return left === right ? 0 : left < right ? -1 : 1
}
