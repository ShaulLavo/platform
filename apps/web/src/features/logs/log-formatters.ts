import type { LogDashboardLevel, LogEventSummary } from '@workspace/contracts'

export function formatLogTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

export function formatLogDateTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    second: '2-digit',
  }).format(new Date(timestamp))
}

export function formatDuration(durationMs: number | null) {
  if (durationMs === null) return ''
  if (durationMs >= 1_000) return `${(durationMs / 1_000).toFixed(2)}s`

  return `${Math.round(durationMs)}ms`
}

export function formatLogPrimary(event: LogEventSummary) {
  return event.action ?? event.operation ?? event.path ?? event.message ?? 'log event'
}

export function formatLogSecondary(event: LogEventSummary) {
  return [event.area, event.source, event.method, event.status]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' · ')
}

export function logLevelClass(level: LogDashboardLevel) {
  if (level === 'error') return 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300'
  if (level === 'warn')
    return 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (level === 'debug') return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'

  return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
}

export function logLevelDotClass(level: LogDashboardLevel) {
  if (level === 'error') return 'bg-red-500'
  if (level === 'warn') return 'bg-amber-500'
  if (level === 'debug') return 'bg-sky-500'

  return 'bg-emerald-500'
}
