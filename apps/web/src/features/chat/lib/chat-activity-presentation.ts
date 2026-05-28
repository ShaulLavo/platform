import type { OrchestrationThreadActivity } from '@workspace/contracts'

export type ChatActivityIconKey =
  | 'approval'
  | 'context'
  | 'error'
  | 'info'
  | 'task'
  | 'thinking'
  | 'tool'
  | 'user-input'

export type ChatActivityPresentation = {
  detail: string | null
  icon: ChatActivityIconKey
  status: string | null
  title: string
}

export function chatActivityPresentation(
  activity: OrchestrationThreadActivity,
): ChatActivityPresentation {
  const payload = recordPayload(activity.payload)
  const title = activityTitle(activity, payload)

  return {
    detail: activityDetail(activity, payload, title),
    icon: activityIcon(activity),
    status: activityStatus(activity, payload),
    title,
  }
}

function activityTitle(activity: OrchestrationThreadActivity, payload: Record<string, unknown>) {
  if (activity.kind === 'approval.requested') return 'Approval requested'
  if (activity.kind === 'approval.resolved') return 'Approval resolved'
  if (activity.kind === 'user-input.requested') return 'User input requested'
  if (activity.kind === 'user-input.resolved') return 'User input resolved'
  if (activity.kind === 'runtime.warning') return 'Runtime warning'
  if (activity.kind === 'runtime.error') return 'Runtime error'
  if (activity.kind === 'context-compaction') return 'Context compacted'
  if (activity.kind === 'context-window.updated') return 'Context window updated'
  if (activity.kind === 'task.started') return 'Task started'
  if (activity.kind === 'task.progress') return taskProgressTitle(activity, payload)
  if (activity.kind === 'task.completed') return completedTaskTitle(payload)
  if (activity.kind.startsWith('tool.')) return toolTitle(activity)

  return activity.summary
}

function completedTaskTitle(payload: Record<string, unknown>) {
  const status = stringValue(payload.status)
  if (status === 'failed') return 'Task failed'
  if (status === 'stopped') return 'Task stopped'

  return 'Task completed'
}

function taskProgressTitle(
  activity: OrchestrationThreadActivity,
  payload: Record<string, unknown>,
) {
  const summary = stringValue(payload.summary)
  if (summary) return summary
  const detail = stringValue(payload.detail)
  if (detail) return detail
  if (activity.summary !== 'Reasoning update') return activity.summary

  return 'Thinking'
}

function toolTitle(activity: OrchestrationThreadActivity) {
  const title = compactActivityLabel(activity.summary)
  if (title) return title

  return 'Tool'
}

function activityIcon(activity: OrchestrationThreadActivity): ChatActivityIconKey {
  if (activity.tone === 'error') return 'error'
  if (activity.tone === 'thinking') return 'thinking'
  if (activity.kind.startsWith('approval.')) return 'approval'
  if (activity.kind.startsWith('user-input.')) return 'user-input'
  if (activity.kind.startsWith('tool.')) return 'tool'
  if (activity.kind.startsWith('task.')) return 'task'
  if (activity.kind.startsWith('context-')) return 'context'

  return 'info'
}

function activityDetail(
  activity: OrchestrationThreadActivity,
  payload: Record<string, unknown>,
  title: string,
) {
  const detail = firstStringValue(payload, ['message', 'detail', 'summary', 'lastToolName'])
  if (activity.kind === 'task.progress') return detail && detail !== title ? detail : null
  if (detail && detail !== title) return detail
  if (activity.summary !== title) return activity.summary

  return null
}

function activityStatus(activity: OrchestrationThreadActivity, payload: Record<string, unknown>) {
  const status = stringValue(payload.status)
  if (status) return formatStatus(status)
  if (activity.kind === 'tool.started') return 'Started'
  if (activity.kind === 'tool.updated') return 'Updated'
  if (activity.kind === 'tool.completed') return 'Completed'
  if (activity.kind === 'approval.requested') return 'Pending'
  if (activity.kind === 'user-input.requested') return 'Pending'
  if (activity.kind.endsWith('.resolved')) return 'Resolved'

  return null
}

function firstStringValue(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = stringValue(record[key])
    if (value) return value
  }

  return null
}

function recordPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  if (Array.isArray(payload)) return {}

  return payload as Record<string, unknown>
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function formatStatus(status: string) {
  if (status === 'inProgress') return 'In progress'

  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`
}

function compactActivityLabel(value: string) {
  return value.replace(/\s+(?:started|updated|complete|completed)\s*$/i, '').trim()
}
