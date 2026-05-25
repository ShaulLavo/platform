export function createAnimationFrameScheduler(callback: () => void) {
  let frame: number | null = null

  function request() {
    if (frame !== null) return

    frame = window.requestAnimationFrame(() => {
      frame = null
      callback()
    })
  }

  function cancel() {
    if (frame === null) return

    window.cancelAnimationFrame(frame)
    frame = null
  }

  return { cancel, request }
}
