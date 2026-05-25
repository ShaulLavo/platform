import type { LogEventSummary } from '@workspace/contracts'

type CancelLiveEventFlush = () => void
type ScheduleLiveEventFlush = (flush: () => void) => CancelLiveEventFlush

export function createLiveEventBatcher(
  onFlush: (events: readonly LogEventSummary[]) => void,
  scheduleFlush: ScheduleLiveEventFlush = scheduleLiveEventFlush,
) {
  let events: LogEventSummary[] = []
  let cancelFlush: CancelLiveEventFlush | null = null

  function flush() {
    cancelFlush = null
    const nextEvents = events
    events = []
    if (nextEvents.length === 0) return

    onFlush(nextEvents)
  }

  return {
    cancel() {
      cancelFlush?.()
      cancelFlush = null
      events = []
    },
    push(event: LogEventSummary) {
      events.push(event)
      if (cancelFlush) return

      cancelFlush = scheduleFlush(flush)
    },
  }
}

function scheduleLiveEventFlush(flush: () => void) {
  const timeout = setTimeout(flush, 16)

  return () => clearTimeout(timeout)
}
