import type { OrchestrationCommand, SessionId } from '@workspace/contracts'
import { event } from './event-factory'
import type { PendingOrchestrationEvent } from './event-store'
import type { OrchestrationProjectedSession } from './read-model'

export function lifecycleResetEvents(
  command: OrchestrationCommand & { sessionId: SessionId },
  session: OrchestrationProjectedSession | undefined,
  at: string,
) {
  if (!session) return []

  const events: PendingOrchestrationEvent[] = []
  if (session.archivedAt) {
    events.push(
      event(command, at, 'session.unarchived', { sessionId: command.sessionId, updatedAt: at }),
    )
  }
  if (session.settledOverride != null) {
    events.push(
      event(command, at, 'session.unsettled', {
        reason: 'activity',
        sessionId: command.sessionId,
        updatedAt: at,
      }),
    )
  }
  if (session.snoozedUntil != null) {
    events.push(
      event(command, at, 'session.unsnoozed', {
        reason: 'activity',
        sessionId: command.sessionId,
        updatedAt: at,
      }),
    )
  }

  return events
}
