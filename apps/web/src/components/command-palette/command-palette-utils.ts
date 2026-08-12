import { parseCompareSavedDocumentId } from '@/features/editor/compare-saved-document'
import {
  parseSearchBufferDocumentId,
  searchBufferDocumentLabel,
  searchBufferDocumentTitle,
} from '@/features/search/search-buffer-document'
import { commandShortcut } from '@/features/menus/utils/shortcut'
import { isFileEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import { basename, displayPath, toTreePath } from '@/lib/path-formatters'
import type { TreeModel } from '@/lib/tree-model'
import { isEditorPlatformCommandId } from '@/keymap/editor-keymap'
import type { CommandSpec } from '@/keymap/command-registry'
import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'
import { fuzzyRankScore } from '@workspace/contracts'

import {
  hiddenCommandPaletteCommands,
  paletteModeCommands,
  selectedFileCommands,
  workspaceOptionalCommands,
} from './command-palette-data'
import type {
  CommandPaletteItem,
  EditorPaletteItem,
  FilePaletteItem,
  QuickAccessMode,
  QuickOpenFileMatch,
} from './command-palette-types'

/** Chat sessions have no path and no file icon, so they need a prefix of their own. */
export const SCRIPT_PREFIX = 'run '
export const SESSION_PREFIX = 'sess '

export function commandPaletteItems(
  specs: readonly CommandSpec[],
  bindings: readonly PlatformKeyBinding[],
): readonly CommandPaletteItem[] {
  return specs
    .filter((spec) => !hiddenCommandPaletteCommands.has(spec.id))
    .map((spec) => platformCommandPaletteItem(spec, bindings))
}

export function groupedCommandItems(
  items: readonly CommandPaletteItem[],
  search = '',
): readonly (readonly [string, readonly CommandPaletteItem[]])[] {
  const query = quickAccessQuery(search)
  if (query) return groupedCommandItemsInOrder(rankedCommandItems(items, query))

  return groupedCommandItemsInOrder(items)
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

  return [
    {
      item,
      order,
      score,
      strong: commandItemStrongMatch(item, query),
    },
  ]
}

function commandItemStrongMatch(item: CommandPaletteItem, query: string) {
  const pieces = queryPieces(query)
  if (pieces.length === 0) return true

  return pieces.every((piece) => commandItemMatchesPiece(item, piece))
}

function commandItemMatchesPiece(item: CommandPaletteItem, piece: string) {
  return item.keywords.some((keyword) => keyword.toLocaleLowerCase().includes(piece))
}

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

export type CommandDisabledContext = {
  readonly activeFilePath: string | null
  readonly hasWorkspace: boolean
}

export function commandPaletteItemDisabledReason(
  item: CommandPaletteItem,
  context: CommandDisabledContext,
) {
  return commandDisabledReason(item.command.command, context)
}

export function isCommandDisabled(command: PlatformCommandId, context: CommandDisabledContext) {
  return commandDisabledReason(command, context) !== null
}

export function commandDisabledReason(command: PlatformCommandId, context: CommandDisabledContext) {
  if (workspaceOptionalCommands.has(command)) return null
  if (!context.hasWorkspace) return 'No workspace open.'

  if (selectedFileCommands.has(command)) {
    return fileBackedPath(context.activeFilePath) ? null : 'No file-backed surface is active.'
  }
  if (isEditorPlatformCommandId(command)) {
    return fileBackedPath(context.activeFilePath) ? null : 'No file-backed surface is active.'
  }

  return null
}

export function fileBackedPath(path: string | null) {
  if (!path) return null
  if (parseSearchBufferDocumentId(path)) return null
  if (parseCompareSavedDocumentId(path)) return null

  return path
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
  const query = quickAccessQuery(search)
  if (!query) return 1

  return fuzzyRankScore(quickAccessRankTarget(value, keywords), query)
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
  if (mode === 'commands') return 'Search commands...'
  if (mode === 'views') return 'Search views...'
  if (mode === 'colorMode') return 'Choose color mode...'
  if (mode === 'colorTheme') return 'Choose color theme...'
  if (mode === 'editors') return 'Search open editors...'
  if (mode === 'sessions') return 'Search sessions, or start one in a project...'
  if (mode === 'symbols') return 'Search symbols in the active editor...'

  return 'Search files, > for commands, sess for sessions...'
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

export function sessionItemValue(threadId: string) {
  return `session:${threadId}`
}

export function sessionProjectItemValue(projectId: string) {
  return `session-project:${projectId}`
}

export function commandKeepsPaletteOpen(command: PlatformCommandId) {
  return paletteModeCommands.has(command)
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
