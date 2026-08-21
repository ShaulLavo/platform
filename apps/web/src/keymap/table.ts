import type { Icon } from '@phosphor-icons/react'

import type { CommandRequirement, EditorCommand, WorkspaceCommand } from './define-command'
import { editorCommands } from './editor-commands'
import type { PlatformCommandId } from './types'
import { workspaceCommands } from './workspace-commands'

/** Every command, with its id narrowed to the union the app indexes commands by. */
export type CommandEntry = EditorCommand<PlatformCommandId> | WorkspaceCommand<PlatformCommandId>

export const platformCommands: readonly CommandEntry[] = [...workspaceCommands, ...editorCommands]

const byId = new Map(platformCommands.map((command) => [command.id, command]))

export function platformCommand(id: PlatformCommandId): CommandEntry | null {
  return byId.get(id) ?? null
}

function iconsById(): Partial<Record<PlatformCommandId, Icon>> {
  const icons: Partial<Record<PlatformCommandId, Icon>> = {}

  for (const command of platformCommands) {
    if (!command.icon) continue

    icons[command.id] = command.icon
  }

  return icons
}

/**
 * A record rather than a `commandIcon(id)` call, because the consumer uses the
 * result as a JSX element type: the React Compiler reads a call there as a
 * component built during render (`static-components`) and errors, while an index
 * into this module-level map is visibly static.
 */
export const commandIcons = iconsById()

function idsWhere(predicate: (command: CommandEntry) => boolean): ReadonlySet<PlatformCommandId> {
  const ids = new Set<PlatformCommandId>()

  for (const command of platformCommands) {
    if (!predicate(command)) continue

    ids.add(command.id)
  }

  return ids
}

// The three policy projections the palette re-exports. The names there stay as
// they were, because `view-groups.tsx` and `command-palette-utils.ts` import
// those exact ones.
export const paletteModeCommandIds = idsWhere((command) => command.keepsPaletteOpen === true)
export const hiddenPaletteCommandIds = idsWhere((command) => command.hiddenInPalette === true)
export const workspaceOptionalCommandIds = idsWhere((command) => command.requires === 'nothing')

/**
 * `EditorPlatformCommandId` is wider than the editor half of the table — it
 * covers every command `@singapor/core` implements, registered here or not — so
 * an unregistered `editor.*` id gets the same `editor` gate `defineEditorCommand`
 * stamps on the registered ones. The editor text menu leans on this: its
 * `editor.editor.action.*` items are handled by the language-server plugin and
 * are not in the table at all.
 */
export function commandRequirement(id: PlatformCommandId): CommandRequirement {
  const command = byId.get(id)
  if (command) return command.requires
  if (id.startsWith('editor.')) return 'editor'

  return 'workspace'
}
