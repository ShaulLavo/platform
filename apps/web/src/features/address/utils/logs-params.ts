import type { LogsFilterState } from '@/features/logs/log-filter-params'

/**
 * `log.*` — the dashboard's filters.
 *
 * Only values that differ from the default are emitted, so an untouched panel adds
 * nothing to the URL and a shared link says exactly what the sender changed.
 */
export function logsParamsFor(filters: LogsFilterState, defaults: LogsFilterState) {
  const params: Record<string, string> = {}

  if (filters.level !== defaults.level) params.level = filters.level
  if (filters.area !== defaults.area) params.area = filters.area
  if (filters.source !== defaults.source) params.src = filters.source
  if (filters.search !== defaults.search) params.find = filters.search
  if (filters.slowMs !== defaults.slowMs) params.slow = String(filters.slowMs)
  if (filters.timeRange !== defaults.timeRange) params.since = filters.timeRange

  return Object.keys(params).length > 0 ? params : null
}

const TIME_RANGES = new Set(['15m', '1h', '6h', '24h', 'all'])
const LEVELS = new Set(['all', 'debug', 'info', 'warn', 'error'])

export function logsFiltersFor(
  params: Readonly<Record<string, string>> | null,
  defaults: LogsFilterState,
): LogsFilterState | null {
  if (!params) return null

  const slowMs = Number(params.slow)

  return {
    area: params.area ?? defaults.area,
    // Validated, not cast: a typo'd level reached the server as a filter value and
    // 422'd the whole dashboard with nothing to say why.
    level: LEVELS.has(params.level ?? '')
      ? (params.level as LogsFilterState['level'])
      : defaults.level,
    search: params.find ?? defaults.search,
    slowMs: Number.isFinite(slowMs) && slowMs >= 0 ? slowMs : defaults.slowMs,
    source: params.src ?? defaults.source,
    timeRange: TIME_RANGES.has(params.since ?? '')
      ? (params.since as LogsFilterState['timeRange'])
      : defaults.timeRange,
  }
}
