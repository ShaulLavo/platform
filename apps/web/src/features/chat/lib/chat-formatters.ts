import type {
  ModelSelection,
  OrchestrationLatestTurn,
  OrchestrationSession,
  OrchestrationThreadActivityTone,
} from '@workspace/contracts'

import type { ChatSidebarThreadSummary } from '../state/chat-projection-store'

const CHAT_MODEL_LABELS: Record<string, string> = {
  codex: 'GPT-5.5',
  'gpt-5.5': 'GPT-5.5',
}

export function compareChatSidebarThreads(
  left: ChatSidebarThreadSummary,
  right: ChatSidebarThreadSummary,
) {
  return (
    threadSortTimestamp(right).localeCompare(threadSortTimestamp(left)) ||
    left.id.localeCompare(right.id)
  )
}

export function chatThreadPreview(thread: ChatSidebarThreadSummary) {
  if (thread.latestTurn?.state === 'running') return 'Working'
  if (thread.session?.lastError) return thread.session.lastError
  if (thread.latestUserMessageAt)
    return `Last message ${formatChatTimestamp(thread.latestUserMessageAt)}`

  return 'No messages yet'
}

export function formatChatModelLabel(modelSelection: Pick<ModelSelection, 'model'>) {
  return CHAT_MODEL_LABELS[modelSelection.model] ?? modelSelection.model
}

export function formatChatTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const today = new Date()
  if (sameLocalDate(date, today)) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export function formatChatDateLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const today = new Date()
  if (sameLocalDate(date, today)) return 'Today'

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

export function latestTurnLabel(latestTurn: OrchestrationLatestTurn | null) {
  if (!latestTurn) return 'Idle'
  if (latestTurn.state === 'running') return 'Working'
  if (latestTurn.state === 'completed') return 'Complete'
  if (latestTurn.state === 'interrupted') return 'Stopped'

  return 'Error'
}

export function sessionLabel(session: OrchestrationSession | null) {
  if (!session) return 'No session'
  if (session.status === 'idle') return 'Idle'
  if (session.status === 'starting') return 'Starting'
  if (session.status === 'running') return 'Running'
  if (session.status === 'ready') return 'Ready'
  if (session.status === 'interrupted') return 'Interrupted'
  if (session.status === 'stopped') return 'Stopped'

  return 'Error'
}

export function activityToneClass(tone: OrchestrationThreadActivityTone) {
  if (tone === 'error') return 'border-destructive/30 bg-destructive/10 text-destructive'
  if (tone === 'approval')
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (tone === 'tool') return 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'

  return 'border-border bg-muted/35 text-muted-foreground'
}

function threadSortTimestamp(thread: ChatSidebarThreadSummary) {
  return thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt
}

function sameLocalDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}
