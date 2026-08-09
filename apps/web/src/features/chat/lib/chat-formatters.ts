import type { ModelSelection, ProviderSnapshot } from '@workspace/contracts'

import type { ChatSidebarThreadSummary } from '../state/chat-projection-store'

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

export function providerModelDisplayLabel(
  provider: ProviderSnapshot | null | undefined,
  modelSelection: Pick<ModelSelection, 'model'>,
) {
  const model = provider?.models.find((candidate) => candidate.slug === modelSelection.model)
  // Fall back to the raw slug: a pretty label for a model the provider does not
  // offer is how a broken catalog ends up confidently naming a model we cannot run.
  if (!model) return modelSelection.model

  return model.shortName ?? model.name
}

export function providerStatusLabel(provider: ProviderSnapshot | null | undefined) {
  if (!provider) return 'Provider unavailable'
  if (provider.status === 'ready') return `${provider.displayLabel} ready`
  if (provider.status === 'warning') return provider.message ?? `${provider.displayLabel} warning`
  if (provider.status === 'disabled') return `${provider.displayLabel} disabled`

  return provider.message ?? `${provider.displayLabel} error`
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

function formatChatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs)) return '0ms'
  if (durationMs < 0) return '0ms'
  if (durationMs < 1000) return `${Math.max(1, Math.round(durationMs))}ms`
  if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(1)}s`
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)}s`

  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.round((durationMs % 60_000) / 1000)
  if (seconds === 0) return `${minutes}m`
  if (seconds === 60) return `${minutes + 1}m`

  return `${minutes}m ${seconds}s`
}

export function formatChatElapsed(startIso: string, endIso: string | undefined | null) {
  if (!endIso) return null

  const startedAtMs = Date.parse(startIso)
  const endedAtMs = Date.parse(endIso)
  if (Number.isNaN(startedAtMs)) return null
  if (Number.isNaN(endedAtMs)) return null
  if (endedAtMs < startedAtMs) return null

  return formatChatDuration(endedAtMs - startedAtMs)
}

export function formatAssistantMessageMeta(createdAt: string, elapsed: string | null) {
  const timestamp = formatChatTimestamp(createdAt)
  if (!elapsed) return timestamp

  return `${timestamp} • ${elapsed}`
}

export function formatWorkingTimer(startIso: string, endIso: string) {
  const startedAtMs = Date.parse(startIso)
  const endedAtMs = Date.parse(endIso)
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) return null

  const elapsedSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000))
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`

  const hours = Math.floor(elapsedSeconds / 3600)
  const minutes = Math.floor((elapsedSeconds % 3600) / 60)
  const seconds = elapsedSeconds % 60

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
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
