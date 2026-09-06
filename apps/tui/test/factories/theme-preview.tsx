import { useTheme } from '@/theme/hooks/use-theme'

export function ThemePreview({
  mode = 'system',
  noColor = false,
}: {
  mode?: 'light' | 'dark' | 'system'
  noColor?: boolean
}) {
  const theme = useTheme(mode, noColor)
  return (
    <box backgroundColor={theme.background}>
      <text fg={theme.foreground}>Theme sample</text>
    </box>
  )
}
