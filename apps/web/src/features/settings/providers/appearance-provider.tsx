import { useCallback, useEffect, useInsertionEffect, useState, type ReactNode } from 'react'

import { loadNerdFont } from '@/lib/default-nerd-font'

import { useSettingsActions } from '@/features/settings/hooks/use-settings-actions'
import { useSettingsDocument } from '@/features/settings/hooks/use-settings-document'
import { useSettingsProjection } from '@/features/settings/hooks/use-settings-projection'
import { WorkbenchDensityBootContext } from '@/features/settings/providers/density-context'
import { ThemeContext, type Theme } from '@/features/settings/providers/theme-context'
import type { SettingsSubmission } from '@workspace/client-core/settings/intent-store'
import {
  applyAppearance,
  resolveColorTheme,
  type AppearanceValues,
} from '@/features/settings/utils/apply-appearance'
import { readSettingsMirror, writeBootMirror } from '@/features/settings/utils/boot-mirror'

const COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)'

type ThemePreview = {
  readonly handingOffTo: string | null
  readonly mode: Theme
}

/** Owns all projected appearance, confirmed boot state, and color-mode preview. */
export function AppearanceProvider({
  bootDensity,
  children,
}: {
  bootDensity: AppearanceValues['workbench.density']
  children: ReactNode
}) {
  const confirmedQuery = useSettingsDocument()
  const projection = useSettingsProjection()
  const { setColorTheme } = useSettingsActions()
  const [bootValues] = useState(bootAppearance)
  const [prefersDark, setPrefersDark] = useState(() => systemPrefersDark())
  const [preview, setPreview] = useState<ThemePreview | null>(null)
  const projectedValues = projection?.values
  const appearanceValues = projectedValues ?? bootValues
  const committedTheme = appearanceValues['workbench.colorTheme']
  const handoffObserved = projectionObservesHandoff(projection, preview?.handingOffTo)
  const renderedTheme = preview && !handoffObserved ? preview.mode : committedTheme

  useEffect(() => {
    const query = window.matchMedia(COLOR_SCHEME_QUERY)
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    query.addEventListener('change', onChange)

    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!handoffObserved || !preview?.handingOffTo) return

    clearMatchingHandoff(setPreview, preview.handingOffTo)
  }, [handoffObserved, preview?.handingOffTo])

  const renderedValues = { ...appearanceValues, 'workbench.colorTheme': renderedTheme }
  // Descendant layout effects measure density-dependent geometry, so the root
  // appearance must be current before those effects run.
  useInsertionEffect(() => {
    applyAppearance(renderedValues, globalThis.document.documentElement, prefersDark)
  }, [prefersDark, renderedValues])

  const confirmedValues = confirmedQuery.data?.values
  const confirmedFontFamily = confirmedValues?.['editor.fontFamily']
  useEffect(() => {
    if (!confirmedFontFamily) return

    void loadNerdFont(confirmedFontFamily)
  }, [confirmedFontFamily])

  useEffect(() => {
    if (!confirmedValues) return

    writeBootMirror(confirmedValues)
  }, [confirmedValues])

  // Stable identity lets palette unmount cleanup clear hover exactly once.
  const clearThemePreview = useCallback(() => {
    setPreview((current) => (current?.handingOffTo ? current : null))
  }, [])

  const previewTheme = useCallback((theme: Theme) => {
    setPreview((current) => (current?.handingOffTo ? current : { handingOffTo: null, mode: theme }))
  }, [])

  const setTheme = (theme: Theme, initiator?: string): SettingsSubmission => {
    const submission = setColorTheme(theme, committedTheme, initiator, (entry) => {
      setPreview({ handingOffTo: entry.request.mutationId, mode: theme })
    })
    if (submission.kind === 'noop') {
      clearThemePreview()
      return submission
    }

    void submission.settled.then(() => clearMatchingHandoff(setPreview, submission.mutationId))
    return submission
  }

  return (
    <WorkbenchDensityBootContext value={bootDensity}>
      <ThemeContext
        value={{
          clearThemePreview,
          previewTheme,
          resolvedTheme: resolveColorTheme(renderedTheme, prefersDark),
          setTheme,
          theme: committedTheme,
        }}
      >
        {children}
      </ThemeContext>
    </WorkbenchDensityBootContext>
  )
}

function clearMatchingHandoff(
  setPreview: (updater: (current: ThemePreview | null) => ThemePreview | null) => void,
  mutationId: string,
) {
  setPreview((current) => (current?.handingOffTo === mutationId ? null : current))
}

function projectionObservesHandoff(
  projection: ReturnType<typeof useSettingsProjection>,
  mutationId: string | null | undefined,
) {
  if (!projection || !mutationId) return false
  if (projection.pendingMutationIds.includes(mutationId)) return true

  return projection.acknowledgedMutationIds.includes(mutationId)
}

export function systemPrefersDark(): boolean {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches
}

/** The values the pre-paint pass uses, before any query can have resolved. */
export function bootAppearance(): AppearanceValues {
  return readSettingsMirror()
}
