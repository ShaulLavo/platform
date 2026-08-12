import {
  createContext,
  createElement,
  useCallback,
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { EditorTheme } from '@singapor/core'
import type { VscodeThemeDefinition, VscodeThemeRegistration } from '@singapor/core/shiki'

import { useTheme } from '@/components/theme-context'
import {
  getCommittedEditorThemeId,
  getSelectedEditorThemeId,
  loadEditorThemeForSelection,
  setActiveEditorColorMode,
  subscribeEditorColorTheme,
  type EditorColorMode,
  type LoadedEditorColorTheme,
} from '@/features/editor/state/editor-color-theme-store'
import { clientErrors } from '@/lib/structured-errors'

type EditorColorThemeState = {
  readonly colorMode: EditorColorMode
  readonly committedThemeId: string
  readonly definition: VscodeThemeDefinition | null
  readonly editorTheme: EditorTheme
  readonly registration: VscodeThemeRegistration | null
  readonly shikiTheme: string
  readonly shikiThemeResolver: () => string
}

const EditorColorThemeContext = createContext<EditorColorThemeState | undefined>(undefined)

export function EditorColorThemeProvider({ children }: { readonly children: ReactNode }) {
  const { resolvedTheme } = useTheme()
  // The selection id doubles as the shiki theme name (id === shikiName), so the
  // provider knows the theme name synchronously even before the JSON loads.
  const shikiTheme = useSyncExternalStore(subscribeEditorColorTheme, () =>
    getSelectedEditorThemeId(resolvedTheme),
  )
  const committedThemeId = useSyncExternalStore(subscribeEditorColorTheme, () =>
    getCommittedEditorThemeId(resolvedTheme),
  )
  const [loadedTheme, setLoadedTheme] = useState<LoadedEditorColorTheme | null>(null)
  const shikiThemeResolver = useCallback(() => shikiTheme, [shikiTheme])

  // The shiki plugin's non-React theme resolver reads the active mode from the
  // store; mirror the app's resolved mode there.
  useEffect(() => {
    setActiveEditorColorMode(resolvedTheme)
  }, [resolvedTheme])

  // Keep showing the previous theme while the new selection loads — the editor
  // never flashes back to unstyled.
  useEffect(() => {
    let cancelled = false
    void loadEditorThemeForSelection(resolvedTheme)
      .then((theme) => {
        if (cancelled) return

        setLoadedTheme(theme)
      })
      .catch(() => {
        // Load failures are logged in the store; keep showing the previous theme.
      })

    return () => {
      cancelled = true
    }
  }, [resolvedTheme, shikiTheme])

  const value = useMemo<EditorColorThemeState>(
    () => ({
      colorMode: resolvedTheme,
      committedThemeId,
      definition: loadedTheme?.definition ?? null,
      editorTheme: loadedTheme?.editorTheme ?? {},
      registration: loadedTheme?.registration ?? null,
      shikiTheme,
      shikiThemeResolver,
    }),
    [committedThemeId, loadedTheme, resolvedTheme, shikiTheme, shikiThemeResolver],
  )

  return createElement(EditorColorThemeContext, { value }, children)
}

export function useEditorColorTheme() {
  const colorTheme = use(EditorColorThemeContext)

  if (colorTheme === undefined) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useEditorColorTheme must be used within an EditorColorThemeProvider',
    })
  }

  return colorTheme
}
