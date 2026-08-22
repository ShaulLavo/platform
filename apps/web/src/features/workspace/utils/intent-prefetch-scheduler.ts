/** Long enough to stay out of a busy frame, short enough that a hint is ready before a hover is. */
const IDLE_TIMEOUT_MS = 200

/**
 * Idle rather than per-frame. Registering a row reads its box, and a `requestAnimationFrame`
 * callback runs before the browser has laid the frame out — so every sync forced one. Run when the
 * work is already done and the same reads are free; a prefetch hint arriving a frame late costs
 * nothing.
 */
export function createIdleScheduler(callback: () => void) {
  let handle: number | null = null
  let idle = false

  function run() {
    handle = null
    callback()
  }

  function request() {
    if (handle !== null) return

    idle = typeof window.requestIdleCallback === 'function'
    handle = idle
      ? window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
      : window.requestAnimationFrame(run)
  }

  function cancel() {
    if (handle === null) return

    if (idle) window.cancelIdleCallback(handle)
    else window.cancelAnimationFrame(handle)
    handle = null
  }

  return { cancel, request }
}
