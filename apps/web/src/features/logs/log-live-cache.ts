import type { LogEventSummary, LogEventsResult } from '@workspace/contracts'

export function mergeLiveLogEvent(
  current: LogEventsResult | undefined,
  event: LogEventSummary,
  maxEvents = 500,
): LogEventsResult | undefined {
  return mergeLiveLogEvents(current, [event], maxEvents)
}

export function mergeLiveLogEvents(
  current: LogEventsResult | undefined,
  events: readonly LogEventSummary[],
  maxEvents = 500,
): LogEventsResult | undefined {
  if (!current) return current
  if (events.length === 0) return current

  const existingIds = new Set(current.events.map((candidate) => candidate.id))
  const uniqueEvents: LogEventSummary[] = []
  for (const event of events) {
    if (existingIds.has(event.id)) continue

    existingIds.add(event.id)
    uniqueEvents.push(event)
  }
  if (uniqueEvents.length === 0) return current

  return {
    ...current,
    events: [...uniqueEvents.reverse(), ...current.events].slice(0, maxEvents),
    total: current.total + uniqueEvents.length,
  }
}
