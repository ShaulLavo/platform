import type { CommandKeyBindingRow } from '@/keymap/active-bindings'
import { platformCommandSpec } from '@/keymap/command-registry'
import type { PlatformCommandId } from '@/keymap/types'
import { formatChord } from '@/keymap/utils/format-keys'

/**
 * Rows whose command id, title or chord contains the query.
 *
 * The title is searched as well as the id because the id is exactly what the
 * user does not know — a list searchable only by id would reproduce the free
 * text box it replaces.
 */
export function matchingKeybindingRows(
  rows: readonly CommandKeyBindingRow[],
  query: string,
): readonly CommandKeyBindingRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return rows

  return rows.filter((row) => rowHaystack(row).includes(needle))
}

/**
 * How many other commands lost their chord to `command`.
 *
 * Read off `shadowedBy`, which the resolver computes with the pane rules
 * applied. A count taken by comparing chords directly would report a global
 * Mod+F and an editor-pane Mod+F as a conflict, and those are separate slots.
 */
export function commandsShadowedBy(
  rows: readonly CommandKeyBindingRow[],
  command: PlatformCommandId,
): number {
  return rows.filter((row) => row.shadowedBy === command).length
}

function rowHaystack(row: CommandKeyBindingRow): string {
  const title = platformCommandSpec(row.command)?.title ?? ''
  const keys = searchableKeys(row)
  const labels = keys.map((shortcut) => `${shortcut} ${formatChord(shortcut)}`).join(' ')

  return `${row.command} ${title} ${labels}`.toLowerCase()
}

function searchableKeys(row: CommandKeyBindingRow): readonly string[] {
  if (row.effectiveKeys.length > 0) return row.effectiveKeys

  return row.keys ? [row.keys] : []
}
