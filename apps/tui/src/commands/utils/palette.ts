import { groupedCommandItems } from '@workspace/client-core/commands/palette'
import type { CommandBus } from '@/commands/state/bus'
import type { TerminalBinding } from '@/commands/utils/bindings'

export function paletteOptions(
  captured: ReturnType<CommandBus['capture']>,
  bindings: readonly TerminalBinding[],
  query: string,
  recents: readonly string[],
) {
  const commands = captured.list().map((row) => ({
    id: row.command.id,
    title: row.command.title,
    category: row.command.category,
    keywords: [
      row.command.title,
      row.command.category,
      row.command.description ?? '',
      row.command.id,
      ...(row.command.aliases ?? []),
    ],
    reason: row.status === 'disabled' ? row.reason : null,
    shortcut: bindings.find((binding) => binding.command === row.command.id)?.keys,
  }))
  return groupedCommandItems(commands, query, recents).flatMap(([group, rows]) =>
    rows.map((row) => ({
      name: row.shortcut ? `${row.title}  ${row.shortcut}` : row.title,
      description: row.reason ?? group,
      value: row,
    })),
  )
}
