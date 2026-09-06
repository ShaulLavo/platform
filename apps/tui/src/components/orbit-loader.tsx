import { useLoaderFrame } from '@/theme/hooks/use-loader-frame'
import { orbitFrames, plainFrames } from '@/theme/utils/loading'
import type { Theme } from '@/theme/utils/theme'

export function OrbitLoader({
  theme,
  reducedMotion = theme.reducedMotion,
}: {
  theme: Theme
  reducedMotion?: boolean
}) {
  const frames = theme.noColor ? plainFrames : orbitFrames
  const frame = useLoaderFrame(frames.length, 250, reducedMotion)
  return <text fg={theme.primary}>{frames[frame]}</text>
}
