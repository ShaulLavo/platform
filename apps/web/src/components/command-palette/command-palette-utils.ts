import { parseSearchBufferDocumentId } from '@/features/search/search-buffer-document'
import { createWindowManagementSettingsSurface } from '@workspace/tiling/utils/layout-builders'
import { builtInWindowManagementCommands } from '@workspace/tiling/utils/layout-command-catalog'
import { defaultWindowManagementHotkeyPresets } from '@workspace/tiling/utils/layout-command-presets'
import { layoutCommandId, windowManagementCommandId } from '@workspace/tiling/utils/layout-ids'
import {
  selectCommandPaletteRows,
  selectVisibleSurfaces,
  windowCommandDisabledReason,
  type LayoutCommandPaletteRow,
} from '@workspace/tiling/utils/layout-selectors'
import type {
  CustomWindowFrame,
  CustomWindowManagementCommand,
  LayoutCommandSurfaceSlot,
  LayoutOperation,
  Surface,
  SurfaceType,
  WindowManagementCommand,
  WorkspaceLayout,
  WorkspaceLayoutCommand,
} from '@workspace/tiling/utils/layout-types'
import { isFileEntry } from '@/lib/file-system-types'
import type { LoadState } from '@/lib/load-state'
import { basename, displayPath, toTreePath } from '@/lib/path-formatters'
import type { TreeModel } from '@/lib/tree-model'
import { isEditorPlatformCommandId } from '@/keymap/editor-keymap'
import type { CommandSpec } from '@/keymap/command-registry'
import type { PlatformCommandId, PlatformKeyBinding, WorkspaceCommandId } from '@/keymap/types'
import { windowManagementCommandIdForWorkspaceCommand } from '@/keymap/window-management-command-ids'
import { fuzzyRankScore } from '@workspace/contracts'

import {
  hiddenCommandPaletteCommands,
  paletteModeCommands,
  selectedFileCommands,
  workspaceOptionalCommands,
} from './command-palette-data'
import type {
  CommandPaletteItem,
  CommandPaletteSelection,
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
    .map((spec) => platformCommandPaletteItem(spec, bindings))
}

export function layoutCommandPaletteItems(layout: WorkspaceLayout): readonly CommandPaletteItem[] {
  return selectCommandPaletteRows(layout).flatMap(layoutCommandPaletteItem)
}

export function windowManagementActionPaletteItems(
  layout: WorkspaceLayout,
): readonly CommandPaletteItem[] {
  return [
    createCustomWindowCommandPaletteItem(layout),
    createLayoutCommandPaletteItem(layout),
    windowManagementSettingsPaletteItem(),
    ...hotkeyPresetPaletteItems(layout),
  ]
}

export function groupedCommandItems(
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
  readonly workspaceLayout: WorkspaceLayout
}

export function commandPaletteItemDisabledReason(
  item: CommandPaletteItem,
  context: CommandDisabledContext,
) {
  if (item.command.kind !== 'platform') {
    if (!context.hasWorkspace) return 'No workspace open.'

    return item.disabledReason ?? null
  }

  return commandDisabledReason(item.command.command, context)
}

export function commandPaletteSelectionLayoutOperation(
  selection: CommandPaletteSelection,
  nowMs: number = Date.now(),
): LayoutOperation | null {
  if (selection.kind === 'layout-operation') return selection.operation
  if (selection.kind === 'custom-window') {
    return {
      command: selection.command,
      nowMs,
      type: 'applyCustomWindowCommand',
    }
  }
  if (selection.kind === 'saved-layout') {
    return {
      command: selection.command,
      type: 'applyLayoutCommand',
    }
  }

  return null
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

function platformCommandPaletteItem(
  spec: CommandSpec,
  bindings: readonly PlatformKeyBinding[],
): CommandPaletteItem {
  return {
    aliases: spec.aliases ?? [],
    category: spec.category,
    command: { command: spec.id, kind: 'platform' },
    description: spec.description,
    icon: spec.icon,
    id: spec.id,
    keywords: commandKeywords(spec),
    shortcut: commandShortcut(spec.id, bindings),
    title: spec.title,
  }
}

function layoutCommandPaletteItem(row: LayoutCommandPaletteRow): readonly CommandPaletteItem[] {
  if (row.kind === 'built-in-window') return []

  const command = layoutCommandPaletteSelection(row)
  if (!command) return []

  return [
    {
      aliases: row.aliases,
      category: row.category,
      command,
      description: layoutCommandDescription(row),
      disabledReason: row.disabledReason,
      icon: row.icon,
      id: `layout:${row.id}`,
      keywords: layoutCommandKeywords(row),
      shortcut: null,
      title: row.title,
    },
  ]
}

function layoutCommandPaletteSelection(
  row: LayoutCommandPaletteRow,
): CommandPaletteSelection | null {
  if (row.kind === 'custom-window' && row.command.kind === 'custom-window') {
    return { command: row.command, kind: 'custom-window' }
  }
  if (row.kind !== 'saved-layout') return null

  return { command: row.command, kind: 'saved-layout' }
}

function layoutCommandDescription(row: LayoutCommandPaletteRow) {
  if (row.kind === 'custom-window') return 'Custom window command.'

  return 'Saved layout command.'
}

function layoutCommandKeywords(row: LayoutCommandPaletteRow) {
  return [row.title, row.category, row.id, row.searchableText, ...row.aliases]
}

function createCustomWindowCommandPaletteItem(layout: WorkspaceLayout): CommandPaletteItem {
  const command = defaultCustomWindowCommand(layout)

  return {
    aliases: ['new window command', 'create custom command'],
    category: 'Window Management',
    command: {
      kind: 'layout-operation',
      operation: {
        command,
        type: 'upsertCustomWindowCommand',
      },
    },
    description: 'Create a custom window command.',
    icon: 'plus',
    id: 'window-management:create-custom-window-command',
    keywords: [
      'Create Custom Window Command',
      'Window Management',
      'custom window command',
      'new command',
    ],
    shortcut: null,
    title: 'Create Custom Window Command',
  }
}

function createLayoutCommandPaletteItem(layout: WorkspaceLayout): CommandPaletteItem {
  const command = savedLayoutCommandForWorkspace(layout)

  return {
    aliases: ['new layout command', 'save current layout'],
    category: 'Window Management',
    command: {
      kind: 'layout-operation',
      operation: {
        command,
        type: 'upsertLayoutCommand',
      },
    },
    description: 'Create a saved layout command from visible surfaces.',
    icon: 'layout',
    id: 'window-management:create-layout-command',
    keywords: [
      'Create Layout Command',
      'Window Management',
      'saved layout command',
      'save current layout',
    ],
    shortcut: null,
    title: 'Create Layout Command',
  }
}

function windowManagementSettingsPaletteItem(): CommandPaletteItem {
  return {
    aliases: ['window settings', 'layout settings', 'hotkey settings'],
    category: 'Window Management',
    command: {
      kind: 'layout-operation',
      operation: {
        surface: createWindowManagementSettingsSurface(),
        type: 'openSurface',
      },
    },
    description: 'Open window management settings.',
    icon: 'settings',
    id: 'window-management:settings',
    keywords: ['Window Management Settings', 'window settings', 'layout settings'],
    shortcut: null,
    title: 'Window Management Settings',
  }
}

function hotkeyPresetPaletteItems(layout: WorkspaceLayout): readonly CommandPaletteItem[] {
  return defaultWindowManagementHotkeyPresets().map((preset) => ({
    aliases: ['hotkey preset', preset.source],
    category: 'Window Management',
    command: {
      kind: 'layout-operation' as const,
      operation: {
        preset,
        type: 'applyHotkeyPreset' as const,
      },
    },
    description: `${preset.title} window management shortcuts.`,
    disabledReason:
      layout.activeHotkeyPresetId === preset.id ? 'Hotkey preset is already active.' : null,
    icon: 'keyboard',
    id: `window-management:hotkey-preset:${preset.id}`,
    keywords: [
      `Apply ${preset.title} Hotkey Preset`,
      'Window Management',
      'hotkey preset',
      preset.source,
    ],
    shortcut: null,
    title: `Apply ${preset.title} Hotkey Preset`,
  }))
}

function defaultCustomWindowCommand(layout: WorkspaceLayout): CustomWindowManagementCommand {
  const id = nextCustomWindowCommandId(layout)

  return {
    aliases: ['custom window command', 'editable window command'],
    category: 'Window Management',
    enabled: true,
    icon: 'window',
    id,
    kind: 'custom-window',
    targetFrame: defaultCustomWindowFrame,
    title: customWindowCommandTitle(id),
  }
}

function savedLayoutCommandForWorkspace(layout: WorkspaceLayout): WorkspaceLayoutCommand {
  const id = nextLayoutCommandId(layout)
  const slots = savedLayoutCommandSlots(layout)

  return {
    aliases: ['current layout', 'saved workspace layout'],
    enabled: true,
    icon: 'layout',
    id,
    slots,
    title: savedLayoutCommandTitle(id),
  }
}

function savedLayoutCommandSlots(layout: WorkspaceLayout): readonly LayoutCommandSurfaceSlot[] {
  const slots = selectVisibleSurfaces(layout).flatMap(savedLayoutCommandSlot)
  if (slots.length > 0) return slots

  return [
    {
      frame: leftHalfFrame,
      id: 'search-results',
      surfaceType: 'search-results',
    },
  ]
}

function savedLayoutCommandSlot(
  surface: Surface,
  index: number,
): readonly LayoutCommandSurfaceSlot[] {
  if (!surfaceTypeCanBeSaved(surface.type)) return []

  return [
    {
      frame: savedLayoutFrame(index),
      id: `${surface.type}:${index}`,
      resourceKey: surface.resourceKey,
      stateKey: surface.stateKey,
      surfaceType: surface.type,
    },
  ]
}

function surfaceTypeCanBeSaved(surfaceType: SurfaceType) {
  if (surfaceType === 'search-preview') return false

  return true
}

function nextCustomWindowCommandId(layout: WorkspaceLayout) {
  const base = windowManagementCommandId('custom-window-command')
  if (!layout.windowCommandsById[base]) return base

  for (let index = 2; ; index += 1) {
    const id = windowManagementCommandId(`custom-window-command-${index}`)
    if (layout.windowCommandsById[id]) continue

    return id
  }
}

function nextLayoutCommandId(layout: WorkspaceLayout) {
  const base = layoutCommandId('saved-current-workspace')
  if (!layout.layoutCommandsById[base]) return base

  for (let index = 2; ; index += 1) {
    const id = layoutCommandId(`saved-current-workspace-${index}`)
    if (layout.layoutCommandsById[id]) continue

    return id
  }
}

function customWindowCommandTitle(id: CustomWindowManagementCommand['id']) {
  if (id === windowManagementCommandId('custom-window-command')) return 'Custom Window Command'

  return 'Custom Window Command Copy'
}

function savedLayoutCommandTitle(id: WorkspaceLayoutCommand['id']) {
  if (id === layoutCommandId('saved-current-workspace')) return 'Saved Current Workspace'

  return 'Saved Current Workspace Copy'
}

function savedLayoutFrame(index: number): CustomWindowFrame {
  if (index % 3 === 1) return rightHalfFrame
  if (index % 3 === 2) return bottomHalfFrame

  return leftHalfFrame
}

const leftHalfFrame: CustomWindowFrame = {
  anchor: 'left',
  height: 100,
  offsetX: 0,
  offsetY: 0,
  unit: 'percent',
  width: 50,
}

const defaultCustomWindowFrame: CustomWindowFrame = {
  anchor: 'center',
  height: 70,
  offsetX: 0,
  offsetY: 0,
  unit: 'percent',
  width: 60,
}

const rightHalfFrame: CustomWindowFrame = {
  anchor: 'right',
  height: 100,
  offsetX: 0,
  offsetY: 0,
  unit: 'percent',
  width: 50,
}

const bottomHalfFrame: CustomWindowFrame = {
  anchor: 'bottom',
  height: 50,
  offsetX: 0,
  offsetY: 0,
  unit: 'percent',
  width: 100,
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
