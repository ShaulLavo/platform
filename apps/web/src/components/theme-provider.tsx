/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffectEvent,
  useEffect,
  useState,
  type ReactNode,
} from "react"

type Theme = "dark" | "light" | "system"
type ResolvedTheme = "dark" | "light"

type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
  disableTransitionOnChange?: boolean
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"
const THEME_VALUES: Theme[] = ["dark", "light", "system"]

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined
)

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

function applyTheme(nextTheme: Theme, disableTransitionOnChange: boolean) {
  const root = document.documentElement
  const resolvedTheme = nextTheme === "system" ? getSystemTheme() : nextTheme
  const restoreTransitions = disableTransitionOnChange
    ? disableTransitionsTemporarily()
    : null

  root.classList.remove("light", "dark")
  root.classList.add(resolvedTheme)

  if (restoreTransitions) {
    restoreTransitions()
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const storedTheme = localStorage.getItem(storageKey)
    if (isTheme(storedTheme)) {
      return storedTheme
    }

    return defaultTheme
  })

  function setTheme(nextTheme: Theme) {
    localStorage.setItem(storageKey, nextTheme)
    setThemeState(nextTheme)
  }

  const syncThemeClass = useEffectEvent(() => {
    applyTheme(theme, disableTransitionOnChange)
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
      return
    }

    setThemeState(defaultTheme)
  })

  useEffect(() => {
    applyTheme(theme, disableTransitionOnChange)

    if (theme !== "system") {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => syncThemeClass()

    mediaQuery.addEventListener("change", handleChange)

    return () => {
      mediaQuery.removeEventListener("change", handleChange)
    }
  }, [disableTransitionOnChange, theme])

  useEffect(() => {
    window.addEventListener("storage", syncThemeFromStorage)

    return () => {
      window.removeEventListener("storage", syncThemeFromStorage)
    }
  }, [])

  const value = {
    theme,
    setTheme,
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }

  return context
}
