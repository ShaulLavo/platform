import type {
  OrchestrationShellStreamItem,
  OrchestrationSessionStreamItem,
} from '@workspace/contracts'

export type OrchestrationStreamItem = OrchestrationShellStreamItem | OrchestrationSessionStreamItem

export function orchestrationStreamItemSequence(item: OrchestrationStreamItem) {
  if (item.kind === 'snapshot') return item.snapshot.snapshotSequence
  if (item.kind === 'event') return item.event.sequence

  return item.sequence
}

export async function* guardOrchestrationStreamSequence<T extends OrchestrationStreamItem>(
  stream: AsyncIterable<T>,
  lastAppliedSequence = -1,
) {
  let sequence = lastAppliedSequence
  let snapshotFloor = lastAppliedSequence
  const delivered = new Set<string>()

  for await (const item of stream) {
    const nextSequence = orchestrationStreamItemSequence(item)
    if (nextSequence <= snapshotFloor || nextSequence < sequence) continue
    if (nextSequence > sequence) delivered.clear()
    const key = streamItemKey(item)
    if (delivered.has(key)) continue

    sequence = nextSequence
    delivered.add(key)
    if (item.kind === 'snapshot') snapshotFloor = nextSequence
    yield item
  }
}

function streamItemKey(item: OrchestrationStreamItem) {
  switch (item.kind) {
    case 'snapshot':
      return 'snapshot'
    case 'event':
      return `event:${item.event.eventId}`
    case 'project-upserted':
      return `project:${item.project.id}`
    case 'project-removed':
      return `project:${item.projectId}`
    case 'worktree-upserted':
      return `worktree:${item.worktree.id}`
    case 'worktree-removed':
      return `worktree:${item.worktreeId}`
    case 'session-upserted':
      return `session:${item.session.id}`
    case 'session-removed':
      return `session:${item.sessionId}`
    default: {
      const exhaustive: never = item
      return exhaustive
    }
  }
}
