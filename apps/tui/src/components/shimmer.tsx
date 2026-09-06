import { useLoaderFrame } from '@/theme/hooks/use-loader-frame'
import type { Theme } from '@/theme/utils/theme'

export function Shimmer({
  text,
  theme,
  reducedMotion = theme.reducedMotion,
}: {
  text: string
  theme: Theme
  reducedMotion?: boolean
}) {
  const characters = Array.from(text)
  const frame = useLoaderFrame(Math.max(1, characters.length), 100, reducedMotion)
  return (
    <span fg={theme.mutedForeground}>
      {characters.slice(0, frame).join('')}
      <span fg={theme.foreground}>
        <strong>{characters[frame]}</strong>
      </span>
      {characters.slice(frame + 1).join('')}
    </span>
  )
}
