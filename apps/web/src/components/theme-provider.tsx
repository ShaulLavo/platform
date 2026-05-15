import {
  useCallback,
  useEffectEvent,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  ThemeProviderContext,
  type ResolvedTheme,
  type Theme,
} from "./theme-context"

type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
  disableTransitionOnChange?: boolean
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"
const THEME_VALUES: Theme[] = ["dark", "light", "system"]

function isTheme(value: string | null): value is Theme {
  if (value === null) {
    return false
  }

  return THEME_VALUES.includes(value as Theme)
}

function getSystemTheme(): ResolvedTheme {
  if (window.matchMedia(COLOR_SCHEME_QUERY).matches) {
    return "dark"
  }

  return "light"
}

function resolvedThemeFor(theme: Theme): ResolvedTheme {
  if (theme === "system") return getSystemTheme()
  return theme
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        style.remove()
      })
    })
  }
}

function applyResolvedTheme(
  resolvedTheme: ResolvedTheme,
  disableTransitionOnChange: boolean
) {
  const root = document.documentElement
  const restoreTransitions = disableTransitionOnChange
    ? disableTransitionsTemporarily()
    : null

  root.classList.remove("light", "dark")
  root.classList.add(resolvedTheme)

  if (restoreTransitions) {
    restoreTransitions()
  }
}

function storedTheme(storageKey: string, defaultTheme: Theme): Theme {
  const storedTheme = localStorage.getItem(storageKey)
  if (isTheme(storedTheme)) return storedTheme

  return defaultTheme
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() =>
    storedTheme(storageKey, defaultTheme)
  )
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolvedThemeFor(storedTheme(storageKey, defaultTheme))
  )

  const setTheme = useCallback(
    (nextTheme: Theme) => {
      localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
      setResolvedTheme(resolvedThemeFor(nextTheme))
    },
    [storageKey]
  )

  const syncThemeClass = useEffectEvent(() => {
    const nextResolvedTheme = resolvedThemeFor(theme)
    applyResolvedTheme(nextResolvedTheme, disableTransitionOnChange)
    setResolvedTheme(nextResolvedTheme)
  })

  const syncThemeFromStorage = useEffectEvent((event: StorageEvent) => {
    if (event.storageArea !== localStorage) {
      return
    }

    if (event.key !== storageKey) {
      return
    }

    if (isTheme(event.newValue)) {
      setThemeState(event.newValue)
      setResolvedTheme(resolvedThemeFor(event.newValue))
      return
    }

    setThemeState(defaultTheme)
    setResolvedTheme(resolvedThemeFor(defaultTheme))
  })

  useEffect(() => {
    applyResolvedTheme(resolvedTheme, disableTransitionOnChange)

    if (theme !== "system") {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => syncThemeClass()

    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [disableTransitionOnChange, resolvedTheme, theme])

  useEffect(() => {
    window.addEventListener("storage", syncThemeFromStorage)

    return () => {
      window.removeEventListener("storage", syncThemeFromStorage)
    }
  }, [])

  const value = useMemo(
    () => ({
      resolvedTheme,
      theme,
      setTheme,
    }),
    [resolvedTheme, setTheme, theme]
  )

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}
