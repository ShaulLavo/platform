import { useEffect, useState } from 'react'

export function useLoaderFrame(frameCount: number, intervalMs: number, reducedMotion: boolean) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const timer = setInterval(
      () => setFrame((current) => (current + 1) % frameCount),
      intervalMs * (reducedMotion ? 2 : 1),
    )
    return () => clearInterval(timer)
  }, [frameCount, intervalMs, reducedMotion])
  return frame % frameCount
}
