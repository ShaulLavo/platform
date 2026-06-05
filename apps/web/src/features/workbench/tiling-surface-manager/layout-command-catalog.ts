import { windowManagementCommandId } from './layout-ids'
import type {
  BuiltInWindowManagementCommand,
  LayoutOperation,
  WindowManagementCommand,
} from './layout-types'

export const CLOSE_ACTIVE_SURFACE_COMMAND_ID = windowManagementCommandId('close-active-surface')
export const MINIMIZE_ACTIVE_SURFACE_COMMAND_ID =
  windowManagementCommandId('minimize-active-surface')
export const MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId('maximize-active-window')
export const RESTORE_ACTIVE_WINDOW_COMMAND_ID = windowManagementCommandId('restore-active-window')
export const SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID = windowManagementCommandId(
  'split-active-window-left',
)
export const SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID = windowManagementCommandId(
  'split-active-window-right',
)
export const SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID =
  windowManagementCommandId('split-active-window-top')
export const SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID = windowManagementCommandId(
  'split-active-window-bottom',
)
export const MOVE_ACTIVE_SURFACE_TO_RAIL_COMMAND_ID = windowManagementCommandId(
  'move-active-surface-to-rail',
)
export const MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID =
  windowManagementCommandId('move-active-window-left')
export const MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID = windowManagementCommandId(
  'move-active-window-right',
)
export const MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID = windowManagementCommandId('move-active-window-top')
export const MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID = windowManagementCommandId(
  'move-active-window-bottom',
)

const WINDOW_MANAGEMENT_CATEGORY = 'Window Management' as const

export const BUILT_IN_WINDOW_MANAGEMENT_COMMANDS = [
  builtInCommand({
    aliases: ['close tab', 'close surface', 'remove surface'],
    capabilityPredicate: 'active-surface-can-close',
    icon: 'x',
    id: CLOSE_ACTIVE_SURFACE_COMMAND_ID,
    operation: 'closeSurface',
    title: 'Close Active Surface',
  }),
  builtInCommand({
    aliases: ['hide surface', 'send to rail', 'minimize tab'],
    capabilityPredicate: 'active-surface-can-minimize',
    icon: 'minus',
    id: MINIMIZE_ACTIVE_SURFACE_COMMAND_ID,
    operation: 'minimizeSurface',
    title: 'Minimize Active Surface',
  }),
  builtInCommand({
    aliases: ['fullscreen', 'zoom window', 'fill screen'],
    capabilityPredicate: 'active-window',
    icon: 'maximize',
    id: MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID,
    operation: 'maximizeWindow',
    title: 'Maximize Active Window',
  }),
  builtInCommand({
    aliases: ['unmaximize', 'normal window', 'restore size'],
    capabilityPredicate: 'active-window',
    icon: 'minimize',
    id: RESTORE_ACTIVE_WINDOW_COMMAND_ID,
    operation: 'restoreWindow',
    title: 'Restore Active Window',
  }),
  builtInCommand({
    aliases: ['split left', 'left half', 'new pane left'],
    capabilityPredicate: 'active-window-and-splittable-surface',
    icon: 'panel-left',
    id: SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID,
    operation: 'splitWindow',
    title: 'Split Active Window Left',
  }),
  builtInCommand({
    aliases: ['split right', 'right half', 'new pane right'],
    capabilityPredicate: 'active-window-and-splittable-surface',
    icon: 'panel-right',
    id: SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
    operation: 'splitWindow',
    title: 'Split Active Window Right',
  }),
  builtInCommand({
    aliases: ['split up', 'top half', 'new pane above'],
    capabilityPredicate: 'active-window-and-splittable-surface',
    icon: 'panel-top',
    id: SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID,
    operation: 'splitWindow',
    title: 'Split Active Window Top',
  }),
  builtInCommand({
    aliases: ['split down', 'bottom half', 'new pane below'],
    capabilityPredicate: 'active-window-and-splittable-surface',
    icon: 'panel-bottom',
    id: SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
    operation: 'splitWindow',
    title: 'Split Active Window Bottom',
  }),
  builtInCommand({
    aliases: ['send to rail', 'hide active surface', 'scratchpad'],
    capabilityPredicate: 'active-surface-can-minimize',
    icon: 'panel-bottom-close',
    id: MOVE_ACTIVE_SURFACE_TO_RAIL_COMMAND_ID,
    operation: 'moveSurface',
    title: 'Move Active Surface To Rail',
  }),
  builtInCommand({
    aliases: ['move window left', 'root edge left', 'left side'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-left-to-line',
    id: MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window Left',
  }),
  builtInCommand({
    aliases: ['move window right', 'root edge right', 'right side'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-right-to-line',
    id: MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window Right',
  }),
  builtInCommand({
    aliases: ['move window up', 'root edge top', 'top side'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-up-to-line',
    id: MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window Top',
  }),
  builtInCommand({
    aliases: ['move window down', 'root edge bottom', 'bottom side'],
    capabilityPredicate: 'active-window',
    icon: 'arrow-down-to-line',
    id: MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
    operation: 'moveWindow',
    title: 'Move Active Window Bottom',
  }),
] as const satisfies readonly BuiltInWindowManagementCommand[]

export function builtInWindowManagementCommands(): readonly BuiltInWindowManagementCommand[] {
  return BUILT_IN_WINDOW_MANAGEMENT_COMMANDS
}

export function mergeWindowManagementCommands(
  customCommands: readonly WindowManagementCommand[],
): readonly WindowManagementCommand[] {
  const commandsById = new Map<string, WindowManagementCommand>()

  for (const command of BUILT_IN_WINDOW_MANAGEMENT_COMMANDS) {
    commandsById.set(command.id, command)
  }
  for (const command of customCommands) {
    commandsById.set(command.id, command)
  }

  return Array.from(commandsById.values())
}

export function commandAliasSearchMetadata(command: WindowManagementCommand): readonly string[] {
  return uniqueSearchTerms([command.title, command.id, command.kind, ...command.aliases])
}

export function commandSearchText(command: WindowManagementCommand): string {
  return commandAliasSearchMetadata(command).join(' ')
}

export function commandMatchesSearch(command: WindowManagementCommand, query: string): boolean {
  const normalizedQuery = normalizedSearchTerm(query)
  if (!normalizedQuery) return true

  return commandSearchText(command).includes(normalizedQuery)
}

function builtInCommand({
  aliases,
  capabilityPredicate,
  icon,
  id,
  operation,
  title,
}: {
  readonly aliases: readonly string[]
  readonly capabilityPredicate: string
  readonly icon: string
  readonly id: BuiltInWindowManagementCommand['id']
  readonly operation: LayoutOperation['type']
  readonly title: string
}): BuiltInWindowManagementCommand {
  return {
    aliases,
    capabilityPredicate,
    category: WINDOW_MANAGEMENT_CATEGORY,
    icon,
    id,
    kind: 'built-in',
    operation,
    title,
  }
}

function uniqueSearchTerms(terms: readonly string[]) {
  return Array.from(new Set(terms.map(normalizedSearchTerm).filter(Boolean)))
}

function normalizedSearchTerm(term: string) {
  return term.trim().toLowerCase()
}
