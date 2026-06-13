import type { EntryTypeFilter } from '@workspace/contracts'

export type ChatInputTriggerKind = 'mention' | 'slash-command'

export type ChatInputTrigger = {
  kind: ChatInputTriggerKind
  query: string
  rangeEnd: number
  rangeStart: number
}

type ChatInputSlashCommand = 'default' | 'plan'

export type ChatInputCommandItem =
  | {
      description: string
      id: string
      label: string
      replacement: string
      type: 'slash-command'
      value: ChatInputSlashCommand
    }
  | {
      description: string
      entryType: EntryTypeFilter
      id: string
      label: string
      path: string
      replacement: string
      type: 'mention'
    }

export type ChatInputCommandGroup = {
  id: string
  items: ChatInputCommandItem[]
  label: string | null
}

const CHAT_INPUT_SLASH_COMMANDS: readonly ChatInputCommandItem[] = [
  {
    description: 'Use default build mode',
    id: 'slash-default',
    label: '/default',
    replacement: '',
    type: 'slash-command',
    value: 'default',
  },
  {
    description: 'Ask for a plan first',
    id: 'slash-plan',
    label: '/plan',
    replacement: '',
    type: 'slash-command',
    value: 'plan',
  },
]

const SENSITIVE_MENTION_PATH_WORDS = new Set([
  'apikey',
  'cert',
  'certificate',
  'certificates',
  'certs',
  'credential',
  'credentials',
  'env',
  'keystore',
  'oauth',
  'passwd',
  'password',
  'passwords',
  'pem',
  'secret',
  'secrets',
  'token',
  'tokens',
])
const SENSITIVE_MENTION_PATH_COMPOUNDS = ['accesskey', 'apikey', 'privatekey'] as const
const SENSITIVE_MENTION_PATH_SEGMENTS = new Set([
  '.env',
  '.netrc',
  '.npmrc',
  '.pypirc',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'id_rsa',
])

export function detectChatInputTrigger(text: string, cursorInput: number): ChatInputTrigger | null {
  const cursor = clampCursor(text, cursorInput)
  const slashTrigger = slashCommandTrigger(text, cursor)
  if (slashTrigger) return slashTrigger

  const tokenStart = tokenStartForCursor(text, cursor)
  const token = text.slice(tokenStart, cursor)
  if (!token.startsWith('@')) return null

  return {
    kind: 'mention',
    query: token.slice(1),
    rangeEnd: cursor,
    rangeStart: tokenStart,
  }
}

export function replaceChatInputTextRange({
  rangeEnd,
  rangeStart,
  replacement,
  text,
}: {
  rangeEnd: number
  rangeStart: number
  replacement: string
  text: string
}) {
  const safeStart = Math.max(0, Math.min(text.length, rangeStart))
  const safeEnd = Math.max(safeStart, Math.min(text.length, rangeEnd))
  const nextText = `${text.slice(0, safeStart)}${replacement}${text.slice(safeEnd)}`

  return {
    cursor: safeStart + replacement.length,
    text: nextText,
  }
}

function chatInputMentionReplacement(path: string) {
  return `@${path} `
}

export function searchChatInputSlashCommands(query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return CHAT_INPUT_SLASH_COMMANDS

  return CHAT_INPUT_SLASH_COMMANDS.filter((command) =>
    command.label.slice(1).toLowerCase().includes(normalizedQuery),
  )
}

export function chatInputMentionCommandItems(
  entries: readonly {
    id: string
    label: string
    path: string
    type: EntryTypeFilter
  }[],
): ChatInputCommandItem[] {
  return entries
    .filter((entry) => !isSensitiveMentionPath(entry.path))
    .map((entry) => ({
      description: entry.path,
      entryType: entry.type,
      id: entry.id,
      label: entry.label,
      path: entry.path,
      replacement: chatInputMentionReplacement(entry.path),
      type: 'mention',
    }))
}

export function chatInputCommandItems(
  trigger: ChatInputTrigger | null,
  entries: Parameters<typeof chatInputMentionCommandItems>[0],
) {
  if (!trigger) return []
  if (trigger.kind === 'slash-command') return searchChatInputSlashCommands(trigger.query)

  return chatInputMentionCommandItems(entries)
}

export function chatInputCommandMenuEmptyLabel(trigger: ChatInputTrigger | null) {
  if (trigger?.kind === 'slash-command') return 'No matching commands'
  if (trigger?.query.trim()) return 'No matching files or folders'

  return 'Type a file or folder name'
}

export function chatInputCommandMenuLoadingLabel(triggerKind: ChatInputTriggerKind) {
  if (triggerKind === 'mention') return 'Searching workspace files...'

  return 'Loading commands...'
}

export function groupChatInputCommandItems(
  items: readonly ChatInputCommandItem[],
  triggerKind: ChatInputTriggerKind,
): ChatInputCommandGroup[] {
  if (items.length === 0) return []
  if (triggerKind !== 'slash-command')
    return [{ id: 'default', items: Array.from(items), label: null }]

  return [{ id: 'built-in', items: Array.from(items), label: 'Built-in' }]
}

export function activeChatInputCommandItem(
  items: readonly ChatInputCommandItem[],
  activeItemId: string | null,
) {
  return items.find((item) => item.id === activeItemId) ?? items[0] ?? null
}

export function chatInputCommandItemByOffset(
  items: readonly ChatInputCommandItem[],
  activeItemId: string | null,
  offset: number,
) {
  if (items.length === 0) return null

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.id === activeItemId),
  )
  const nextIndex = (activeIndex + offset + items.length) % items.length

  return items[nextIndex] ?? null
}

function slashCommandTrigger(text: string, cursor: number): ChatInputTrigger | null {
  const lineStart = text.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1
  const linePrefix = text.slice(lineStart, cursor)
  if (!linePrefix.startsWith('/')) return null

  const commandMatch = /^\/(\S*)$/.exec(linePrefix)
  if (!commandMatch) return null

  return {
    kind: 'slash-command',
    query: commandMatch[1] ?? '',
    rangeEnd: cursor,
    rangeStart: lineStart,
  }
}

function clampCursor(text: string, cursorInput: number) {
  if (!Number.isFinite(cursorInput)) return text.length

  return Math.max(0, Math.min(text.length, Math.floor(cursorInput)))
}

function tokenStartForCursor(text: string, cursor: number) {
  let index = cursor - 1
  while (index >= 0 && !chatInputTriggerBoundary(text[index] ?? '')) {
    index -= 1
  }

  return index + 1
}

function chatInputTriggerBoundary(char: string) {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t'
}

function isSensitiveMentionPath(path: string) {
  return path.split('/').some(isSensitiveMentionPathSegment)
}

function isSensitiveMentionPathSegment(segment: string) {
  const normalized = segment.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === '.env' || normalized.startsWith('.env.')) return true
  if (SENSITIVE_MENTION_PATH_SEGMENTS.has(normalized)) return true
  if (SENSITIVE_MENTION_PATH_SEGMENTS.has(normalized.split('.')[0] ?? normalized)) return true

  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean)
  if (words.some((word) => SENSITIVE_MENTION_PATH_WORDS.has(word))) return true

  const compact = words.join('')
  return SENSITIVE_MENTION_PATH_COMPOUNDS.some((word) => compact.includes(word))
}
