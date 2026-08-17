// What has to be true before a command can run — shared by the palette, the menus, and the keymap tests.
import { parseCompareSavedDocumentId } from '@/features/editor/utils/compare-saved-document'
import { parseRefDocumentId } from '@/features/git/utils/ref-document'
import { parseSearchBufferDocumentId } from '@/features/search/utils/buffer-document'
import { commandRequirement } from '@/keymap/table'
import type { PlatformCommandId } from '@/keymap/types'

export type CommandDisabledContext = {
  readonly activeFilePath: string | null
  readonly hasWorkspace: boolean
}

export function isCommandDisabled(command: PlatformCommandId, context: CommandDisabledContext) {
  return commandDisabledReason(command, context) !== null
}

export function commandDisabledReason(command: PlatformCommandId, context: CommandDisabledContext) {
  const requires = commandRequirement(command)
  if (requires === 'nothing') return null
  if (!context.hasWorkspace) return 'No workspace open.'
  if (requires === 'workspace') return null

  return fileBackedPath(context.activeFilePath) ? null : 'No file-backed surface is active.'
}

export function fileBackedPath(path: string | null) {
  if (!path) return null
  if (parseSearchBufferDocumentId(path)) return null
  if (parseCompareSavedDocumentId(path)) return null
  if (parseRefDocumentId(path)) return null

  return path
}
