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

  for await (const item of stream) {
    const nextSequence = orchestrationStreamItemSequence(item)
    if (nextSequence <= sequence) continue

    sequence = nextSequence
    yield item
  }
}
