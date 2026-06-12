import { useState } from 'react'

// Latches on the first visible render and never resets. Scoped to the host
// instance on purpose: an unmounted host loses its renderer's state anyway,
// so a remounted surface starts cold again.
export function useSurfaceRevealed(visible: boolean) {
  const [revealed, setRevealed] = useState(visible)
  if (visible && !revealed) setRevealed(true)

  return revealed || visible
}
