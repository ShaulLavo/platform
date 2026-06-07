import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import { builtInWindowManagementCommands } from '@/features/tiling-surface-manager/engine/layout-command-catalog'
import { windowCommandDisabledReason } from '@/features/tiling-surface-manager/engine/layout-selectors'
import type {
  WindowManagementCommand,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'
import { isFileEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import { basename, displayPath, toTreePath } from '@/lib/path-formatters'
import type { TreeModel } from '@/lib/tree-model'
import {
  isEditorPlatformCommandId,
  type CommandSpec,
  type PlatformCommandId,
  type PlatformKeyBinding,
  type WorkspaceCommandId,
  windowManagementCommandIdForWorkspaceCommand,
} from '@/keymap'
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

export function commandPaletteItems(
  specs: readonly CommandSpec[],
  bindings: readonly PlatformKeyBinding[],
): readonly CommandPaletteItem[] {
  return specs
    .filter((spec) => !hiddenCommandPaletteCommands.has(spec.id))
    .map((spec) => ({
      shortcut: commandShortcut(spec.id, bindings),
      spec,
    }))
}

export function groupedCommandItems(
  items: readonly CommandPaletteItem[],
): readonly (readonly [string, readonly CommandPaletteItem[]])[] {
  const groups = new Map<string, CommandPaletteItem[]>()
  for (const item of items) {
    const group = groups.get(item.spec.category)
    if (group) {
      group.push(item)
      continue
    }

    groups.set(item.spec.category, [item])
  }

  return Array.from(groups.entries())
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
  return openFilePaths.map((path) => ({
    active: path === selectedFilePath,
    name: basename(path),
    path,
    pathLabel: displayPath(path),
  }))
}

export function commandKeywords(spec: CommandSpec) {
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
  readonly workspaceLayout: WorkspaceLayout
}

export function isCommandDisabled(command: PlatformCommandId, context: CommandDisabledContext) {
  return commandDisabledReason(command, context) !== null
}

export function commandDisabledReason(command: PlatformCommandId, context: CommandDisabledContext) {
  if (workspaceOptionalCommands.has(command)) return null
  if (!context.hasWorkspace) return 'No workspace open.'

  const windowReason = windowManagementDisabledReason(command, context.workspaceLayout)
  if (windowReason) return windowReason
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

  return path
}

export function quickAccessMode(search: string): QuickAccessMode {
  if (search.startsWith('view ')) return 'views'
  if (search.startsWith('color ')) return 'colorMode'
  if (search.startsWith('edt ')) return 'editors'
  if (search.startsWith('@')) return 'symbols'
  return search.startsWith('>') ? 'commands' : 'files'
}

export function quickAccessQuery(search: string) {
  if (search.startsWith('view ')) return search.slice(5).trimStart()
  if (search.startsWith('color ')) return search.slice(6).trimStart()
  if (search.startsWith('edt ')) return search.slice(4).trimStart()
  if (search.startsWith('@')) return search.slice(1).trimStart()
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
  if (mode === 'editors') return 'No open editors'
  if (mode === 'symbols') return 'No matching symbols'

  return 'No matching files'
}

export function placeholderForMode(mode: QuickAccessMode) {
  if (mode === 'commands') return 'Search commands...'
  if (mode === 'views') return 'Search views...'
  if (mode === 'colorMode') return 'Choose color mode...'
  if (mode === 'editors') return 'Search open editors...'
  if (mode === 'symbols') return 'Search symbols in the active editor...'

  return 'Search files or type > for commands...'
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

function commandShortcut(command: PlatformCommandId, bindings: readonly PlatformKeyBinding[]) {
  const binding = bindings.find((candidate) => candidate.command === command)
  if (!binding) return null
  if (typeof binding.hotkey === 'string') return formatHotkey(binding.hotkey)

  return formatHotkey(binding.keys)
}

const builtInWindowCommandsById = new Map(
  builtInWindowManagementCommands().map((command) => [command.id, command]),
)

function windowManagementDisabledReason(command: PlatformCommandId, layout: WorkspaceLayout) {
  const windowCommand = windowManagementCommandForPlatformCommand(command)
  if (!windowCommand) return null

  return windowCommandDisabledReason(layout, windowCommand)
}

function windowManagementCommandForPlatformCommand(
  command: PlatformCommandId,
): WindowManagementCommand | null {
  if (isEditorPlatformCommandId(command)) return null

  const workspaceCommand = layoutAliasCommand(command) ?? command
  const windowCommandId = windowManagementCommandIdForWorkspaceCommand(workspaceCommand)
  if (!windowCommandId) return null

  return builtInWindowCommandsById.get(windowCommandId) ?? null
}

function layoutAliasCommand(command: PlatformCommandId): WorkspaceCommandId | null {
  if (command === 'workspace.closeCurrentTab') return 'workspace.window.closeActiveSurface'
  if (command === 'workspace.splitEditor') return 'workspace.window.splitActiveWindowRight'

  return null
}

function quickAccessRankTarget(value: string, keywords: readonly string[] | undefined) {
  const label = keywords?.[0] ?? value
  const path = keywords?.[1] ?? value
  const extraKeywords = [value].concat(keywords?.slice(2) ?? [])

  return { label, keywords: extraKeywords, path }
}

function formatHotkey(hotkey: string) {
  const isMac = isMacPlatform()
  const separator = isMac ? '' : '+'

  return hotkey
    .split('+')
    .map((token) => hotkeyTokenLabel(token, isMac))
    .join(separator)
}

function hotkeyTokenLabel(token: string, isMac: boolean) {
  const normalized = token.toLowerCase()
  if (normalized === 'mod') return isMac ? '⌘' : 'Ctrl'
  if (normalized === 'meta') return isMac ? '⌘' : 'Meta'
  if (normalized === 'cmd') return isMac ? '⌘' : 'Cmd'
  if (normalized === 'ctrl') return isMac ? '⌃' : 'Ctrl'
  if (normalized === 'shift') return isMac ? '⇧' : 'Shift'
  if (normalized === 'alt') return isMac ? '⌥' : 'Alt'
  if (normalized === 'enter') return '↵'
  if (normalized === 'escape') return 'Esc'
  if (normalized.length === 1) return normalized.toUpperCase()

  return token
}

function isMacPlatform() {
  if (typeof navigator === 'undefined') return false

  return /Mac|iPhone|iPad|iPod/.test(navigator.platform)
}
