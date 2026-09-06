import { useRenderer } from '@opentui/react'
import type { TerminalColors } from '@opentui/core'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { resolveTheme, type ThemePreferences } from '@/theme/utils/theme'
import { terminalColorMode } from '@/host/utils/capabilities'

export function useTheme(
  mode: 'light' | 'dark' | 'system',
  noColor: boolean,
  options: ThemePreferences = {},
) {
  const renderer = useRenderer()
  const [colors, setColors] = useState<TerminalColors | null>(null)
  const capabilities = useSyncExternalStore(
    (notify) => {
      renderer.on('capabilities', notify)
      return () => {
        renderer.off('capabilities', notify)
      }
    },
    () => renderer.capabilities,
  )
  const system = useSyncExternalStore(
    (notify) => {
      renderer.on('theme_mode', notify)
      return () => {
        renderer.off('theme_mode', notify)
      }
    },
    () => renderer.themeMode ?? 'dark',
  )
  useEffect(() => {
    if (noColor) return
    let active = true
    const receive = (next: TerminalColors) => {
      if (active) setColors(next)
    }
    renderer.on('palette', receive)
    void renderer
      .getPalette({ size: 16, timeout: 200 })
      .then(receive)
      .catch(() => {})
    return () => {
      active = false
      renderer.off('palette', receive)
    }
  }, [renderer, noColor])
  return resolveTheme(mode, system, noColor, {
    ...options,
    colors,
    colorMode: terminalColorMode(capabilities, noColor),
  })
}
