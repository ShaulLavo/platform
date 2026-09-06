import type { KeyValueStorage } from '@workspace/client-core/storage'
import * as v from 'valibot'
import type { FileStorage } from '@/storage/files'

const recentCommandsSchema = v.array(v.string())
export const RECENT_COMMANDS = 'recent-commands'

export function parseRecentCommands(raw: string | null): readonly string[] {
  if (raw === null) return []
  return v.parse(recentCommandsSchema, JSON.parse(raw))
}

export function readRecentCommands(storage: KeyValueStorage): readonly string[] {
  return parseRecentCommands(storage.getItem(RECENT_COMMANDS))
}

export function recordRecentCommand(storage: Pick<FileStorage, 'updateItem'>, commandId: string) {
  storage.updateItem(RECENT_COMMANDS, (current) => {
    const recent = parseRecentCommands(current).filter((id) => id !== commandId)
    return JSON.stringify([commandId, ...recent].slice(0, 50))
  })
}
