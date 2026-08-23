import { useEffect, useInsertionEffect, useState, type ReactNode } from 'react'

import { loadNerdFont } from '@/lib/default-nerd-font'

import { useSettings } from '../hooks/use-settings'
import { applyAppearance, type AppearanceValues } from '../utils/apply-appearance'
import { readSettingsMirror, writeBootMirror } from '../utils/boot-mirror'
import { WorkbenchDensityBootContext } from './density-context'

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

/**
 * Keeps the document element in step with the appearance settings.
 *
 * The corresponding pre-paint application happens at module scope in `main.tsx`.
 * This provider keeps the painted boot density available to virtualized
 * descendants, then corrects the DOM in the insertion phase once the server
 * snapshot lands so layout effects never observe mixed CSS and geometry.
 */
export function AppearanceProvider({
  bootDensity,
  children,
}: {
  bootDensity: AppearanceValues['workbench.density']
  children: ReactNode
}) {
  const settings = useSettings()
  const [prefersDark, setPrefersDark] = useState(() => systemPrefersDark())

  useEffect(() => {
    const query = window.matchMedia(COLOR_SCHEME_QUERY)
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)

    return () => query.removeEventListener('change', onChange)
  }, [])

  const values = settings.data?.values
  useInsertionEffect(() => {
    // Before the first snapshot lands, the mirror is what is already on screen.
    // Re-applying it here would be a no-op; waiting avoids a flash to defaults.
    if (!values) return

    applyAppearance(values, document.documentElement, prefersDark)
  }, [values, prefersDark])

  useEffect(() => {
    if (!values) return

    // Registering the face is separate from setting the stack: the download can
    // be slow the first time a font is chosen, and the text should reflow to a
    // monospace fallback immediately rather than wait for it.
    void loadNerdFont(values['editor.fontFamily'])
    // Written only from a server-sourced snapshot, never from an optimistic
    // value: a write that then fails would leave the wrong value to survive the
    // next reload.
    writeBootMirror(values)
  }, [values])

  return <WorkbenchDensityBootContext value={bootDensity}>{children}</WorkbenchDensityBootContext>
}

export function systemPrefersDark(): boolean {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches
}

/** The values the pre-paint pass uses, before any query can have resolved. */
export function bootAppearance(): AppearanceValues {
  return readSettingsMirror()
}
