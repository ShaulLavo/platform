import {
  scrollTabStripForBodyPoint,
  tabStripBodyAutoscrollCanAdvance,
  type TabStripBodyAutoscrollInput,
  type TabStripBodyAutoscroller,
} from '@workspace/tiling/utils/tab-strip-hit-test'

export type { TabStripBodyAutoscrollInput, TabStripBodyAutoscroller }

type TabStripBodyAutoscrollState = TabStripBodyAutoscrollInput & {
  frameId: number | null
}

export function createTabStripBodyAutoscroller(): TabStripBodyAutoscroller {
  let state: TabStripBodyAutoscrollState | null = null

  function stop() {
    const frameId = state?.frameId ?? null
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
    }
    state = null
  }

  function update(input: TabStripBodyAutoscrollInput) {
    if (!tabStripBodyAutoscrollCanAdvance(input.stripElement, input.windowElement, input.point)) {
      stop()
      return
    }

    state = {
      ...input,
      frameId: state?.frameId ?? null,
    }
    scheduleFrame()
  }

  function scheduleFrame() {
    if (!state) return
    if (state.frameId !== null) return

    state.frameId = requestAnimationFrame(runFrame)
  }

  function runFrame() {
    const currentState = state
    if (!currentState) return

    currentState.frameId = null
    if (
      !tabStripBodyAutoscrollCanAdvance(
        currentState.stripElement,
        currentState.windowElement,
        currentState.point,
      )
    ) {
      stop()
      return
    }

    const moved = scrollTabStripForBodyPoint(
      currentState.stripElement,
      currentState.windowElement,
      currentState.point,
    )
    if (!moved) {
      stop()
      return
    }

    currentState.onAutoScroll?.()
    scheduleFrame()
  }

  return { stop, update }
}
