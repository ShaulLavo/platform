import type { OrchestrationLatestTurn, OrchestrationThreadActivity } from '@workspace/contracts'

import { chatActivityPresentation, type ChatActivityIconKey } from './chat-activity-presentation'

export type ChatWorkLogTone = 'error' | 'info' | 'thinking' | 'tool'

export type ChatWorkLogEntry = {
  createdAt: string
  detail: string | null
  icon: ChatActivityIconKey
  id: string
  itemType: string | null
  status: string | null
  title: string
  tone: ChatWorkLogTone
}

type DerivedChatWorkLogEntry = ChatWorkLogEntry & {
  activityKind: string
  collapseKey: string | null
}

export function chatWorkLogEntries({
  activities,
  latestTurnId,
}: {
  activities: readonly OrchestrationThreadActivity[]
  latestTurnId: OrchestrationLatestTurn['turnId'] | null | undefined
}) {
  const entries = [...activities]
    .toSorted(compareActivities)
    .filter((activity) => isActivityForWorkLog(activity, latestTurnId))
    .map(derivedWorkLogEntry)

  return collapseWorkLogEntries(entries).map(
    ({ activityKind: _activityKind, collapseKey: _collapseKey, ...entry }) => entry,
  )
}

function compareActivities(left: OrchestrationThreadActivity, right: OrchestrationThreadActivity) {
  return left.createdAt.localeCompare(right.createdAt)
}

function isActivityForWorkLog(
  activity: OrchestrationThreadActivity,
  latestTurnId: OrchestrationLatestTurn['turnId'] | null | undefined,
) {
  if (latestTurnId && activity.turnId !== latestTurnId) return false
  if (activity.kind === 'tool.started') return false
  if (activity.kind === 'task.started') return false
  if (activity.kind === 'context-window.updated') return false
  if (activity.summary === 'Checkpoint captured') return false
  if (isPlanBoundaryToolActivity(activity)) return false

  return true
}

function isPlanBoundaryToolActivity(activity: OrchestrationThreadActivity) {
  if (activity.kind !== 'tool.updated' && activity.kind !== 'tool.completed') return false

  const detail = stringPayloadValue(activity.payload, 'detail')
  return Boolean(detail?.startsWith('ExitPlanMode:'))
}

function derivedWorkLogEntry(activity: OrchestrationThreadActivity): DerivedChatWorkLogEntry {
  const presentation = chatActivityPresentation(activity)
  const itemType = stringPayloadValue(activity.payload, 'itemType')
  const entry = {
    activityKind: activity.kind,
    collapseKey: null,
    createdAt: activity.createdAt,
    detail: presentation.detail,
    icon: presentation.icon,
    id: activity.id,
    itemType,
    status: presentation.status,
    title: presentation.title,
    tone: workLogTone(activity),
  }

  return {
    ...entry,
    collapseKey: workLogCollapseKey(entry),
  }
}

function workLogTone(activity: OrchestrationThreadActivity): ChatWorkLogTone {
  if (activity.kind === 'task.progress') return 'thinking'
  if (activity.tone === 'approval') return 'info'
  if (activity.tone === 'error') return 'error'
  if (activity.tone === 'thinking') return 'thinking'
  if (activity.tone === 'tool') return 'tool'

  return 'info'
}

function collapseWorkLogEntries(entries: readonly DerivedChatWorkLogEntry[]) {
  const collapsed: DerivedChatWorkLogEntry[] = []
  for (const entry of entries) {
    const previous = collapsed.at(-1)
    if (previous && shouldCollapseWorkLogEntries(previous, entry)) {
      collapsed[collapsed.length - 1] = mergeWorkLogEntries(previous, entry)
      continue
    }
    collapsed.push(entry)
  }

  return collapsed
}

function shouldCollapseWorkLogEntries(
  previous: DerivedChatWorkLogEntry,
  next: DerivedChatWorkLogEntry,
) {
  if (!isCollapsibleToolLifecycleKind(previous.activityKind)) return false
  if (!isCollapsibleToolLifecycleKind(next.activityKind)) return false
  if (previous.activityKind === 'tool.completed') return false
  if (!previous.collapseKey || !next.collapseKey) return false

  return previous.collapseKey === next.collapseKey
}

function isCollapsibleToolLifecycleKind(kind: string) {
  return kind === 'tool.updated' || kind === 'tool.completed'
}

function mergeWorkLogEntries(
  previous: DerivedChatWorkLogEntry,
  next: DerivedChatWorkLogEntry,
): DerivedChatWorkLogEntry {
  return {
    ...previous,
    ...next,
    detail: next.detail ?? previous.detail,
    itemType: next.itemType ?? previous.itemType,
    status: next.status ?? previous.status,
    title: next.title || previous.title,
  }
}

function workLogCollapseKey(entry: Omit<DerivedChatWorkLogEntry, 'collapseKey'>) {
  if (!isCollapsibleToolLifecycleKind(entry.activityKind)) return null

  const title = compactActivityLabel(entry.title)
  const detail = entry.detail?.trim() ?? ''
  const itemType = entry.itemType ?? ''
  if (!title && !detail && !itemType) return null

  return [itemType, title, detail].join('\u001f')
}

function stringPayloadValue(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object') return null
  if (Array.isArray(payload)) return null

  const value = (payload as Record<string, unknown>)[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function compactActivityLabel(value: string) {
  return value.replace(/\s+(?:started|updated|complete|completed)\s*$/i, '').trim()
}
