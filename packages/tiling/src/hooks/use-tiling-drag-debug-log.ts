import { useRef, useState } from 'react'

import type { TilingDragData, TilingDropData } from '@workspace/tiling/utils/drag-data'
import type { ActiveTilingDrag, PointerDetails } from '@workspace/tiling/utils/drag-state'
import {
  noneTargetDebug,
  stateLogDetails,
  type StateLogInput,
  type StateLogPhase,
} from '@workspace/tiling/utils/drag-log'
import type { PointerCoordinates } from '@workspace/tiling/utils/geometry-primitives'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

const STATE_EVENT_LIMIT = 80

export type TilingDragMissingTargetLogInput = {
  readonly activeDrag: ActiveTilingDrag | null
  readonly layout: WorkspaceLayout
  readonly phase: StateLogPhase
  readonly point: PointerCoordinates
  readonly pointSource: PointerDetails['source']
  readonly rawTarget: TilingDropData | null
  readonly source: TilingDragData
}

export type TilingDragDebugLogger = {
  readonly logMissingTarget: (input: TilingDragMissingTargetLogInput) => void
  readonly logStateAfterMove: (input: StateLogInput) => void
}

export type TilingDragDebugLog = TilingDragDebugLogger & {
  readonly resetStateLog: () => void
  readonly stateEvents: readonly string[]
}

export function useTilingDragDebugLog(): TilingDragDebugLog {
  const [stateEvents, setStateEvents] = useState<readonly string[]>([])
  const lastStateEventSignatureRef = useRef<string | null>(null)
  const stateEventSequenceRef = useRef(0)

  function logStateAfterMove(input: StateLogInput) {
    const details = stateLogDetails(input)
    if (details.signature === lastStateEventSignatureRef.current) return

    lastStateEventSignatureRef.current = details.signature
    stateEventSequenceRef.current += 1
    const event = `${stateEventSequenceRef.current}. ${details.message}`
    setStateEvents((current) => [event, ...current].slice(0, STATE_EVENT_LIMIT))
  }

  function logMissingTarget({
    activeDrag,
    layout,
    phase,
    point,
    pointSource,
    rawTarget,
    source,
  }: TilingDragMissingTargetLogInput) {
    logStateAfterMove({
      debug: noneTargetDebug(source, point, pointSource, rawTarget, activeDrag),
      layout,
      phase,
      source,
      target: null,
    })
  }

  function resetStateLog() {
    lastStateEventSignatureRef.current = null
    stateEventSequenceRef.current = 0
    setStateEvents([])
  }

  return {
    logMissingTarget,
    logStateAfterMove,
    resetStateLog,
    stateEvents,
  }
}
