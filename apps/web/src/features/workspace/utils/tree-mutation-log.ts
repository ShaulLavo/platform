import type {
  FileTreeMutationEvent,
  FileTreeMutationSemanticEvent,
} from '@workspace/tree/utils/model/publicTypes'

const MAX_LOGGED_PATHS = 12

export type TreeMutationLogContext = {
  readonly batchChildCount?: number
  readonly canonicalChanged: boolean
  readonly operation: FileTreeMutationEvent['operation']
  readonly pathCountAfter?: number
  readonly pathCountBefore?: number
  readonly paths?: readonly string[]
  readonly projectionChanged: boolean
  readonly truncatedPathCount?: number
  readonly usedPreparedInput?: boolean
  readonly visibleCountDelta: number | null
}

export function treeMutationLogContext(event: FileTreeMutationEvent): TreeMutationLogContext {
  const base = {
    canonicalChanged: event.canonicalChanged,
    operation: event.operation,
    projectionChanged: event.projectionChanged,
    visibleCountDelta: event.visibleCountDelta,
  }
  if (event.operation === 'reset') {
    return {
      ...base,
      pathCountAfter: event.pathCountAfter,
      pathCountBefore: event.pathCountBefore,
      usedPreparedInput: event.usedPreparedInput,
    }
  }

  const paths = mutationEventPaths(event)
  const boundedPaths = paths.slice(0, MAX_LOGGED_PATHS)
  const pathContext =
    paths.length === 0
      ? {}
      : {
          paths: boundedPaths,
          truncatedPathCount: Math.max(0, paths.length - boundedPaths.length),
        }
  if (event.operation !== 'batch') return { ...base, ...pathContext }

  return { ...base, ...pathContext, batchChildCount: event.events.length }
}

function mutationEventPaths(event: FileTreeMutationEvent): readonly string[] {
  if (event.operation === 'batch') return event.events.flatMap(mutationSemanticEventPaths)

  return mutationSemanticEventPaths(event)
}

function mutationSemanticEventPaths(event: FileTreeMutationSemanticEvent): readonly string[] {
  if (event.operation === 'add' || event.operation === 'remove') return [event.path]
  if (event.operation === 'move') return [event.from, event.to]

  return []
}
