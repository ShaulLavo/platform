import { useMemo, useState, useEffect, type ReactNode } from 'react'

import { useSettings } from '@/features/settings/hooks/use-settings'
import { useSettingsActions } from '@/features/settings/hooks/use-settings-actions'
import { systemPrefersDark } from '@/features/settings/providers/appearance-provider'
import { resolveColorTheme } from '@/features/settings/utils/apply-appearance'
import { readSettingsMirror } from '@/features/settings/utils/boot-mirror'

import { ThemeProviderContext, type ResolvedTheme, type Theme } from './theme-context'

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

/**
 * Publishes the resolved theme to everything that needs to know it — the
 * toaster, the editor's syntax theme, the terminal palette, the titlebar menu.
 *
 * It no longer owns the value. `workbench.colorTheme` is a setting now, so this
 * reads the same document the settings page writes and the same one a hand-edit
 * lands in. What it lost along the way: the `theme` localStorage key, and the
 * cross-tab `storage` listener that used to sync it — the settings SSE stream
 * does that job for every setting rather than for this one by hand.
 *
 * Applying the class is not this component's job either; `AppearanceProvider`
 * does that alongside the material knobs, so the whole appearance lands in one
 * pass rather than in two that race.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const settings = useSettings()
  const { setColorTheme } = useSettingsActions()
  const [prefersDark, setPrefersDark] = useState(() => systemPrefersDark())

  useEffect(() => {
    const query = window.matchMedia(COLOR_SCHEME_QUERY)
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)

    return () => query.removeEventListener('change', onChange)
  }, [])

  // The mirror, not the registry default, is the pre-hydration answer: it is
  // what the pre-paint pass already put on screen, so reading anything else
  // here would make the first render disagree with the document.
  const theme: Theme = settings.data?.values['workbench.colorTheme'] ?? bootTheme()
  const resolvedTheme: ResolvedTheme = resolveColorTheme(theme, prefersDark)

  const value = useMemo(
    () => ({ resolvedTheme, setTheme: setColorTheme, theme }),
    [resolvedTheme, setColorTheme, theme],
  )

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}

function bootTheme(): Theme {
  return readSettingsMirror()['workbench.colorTheme']
}
