import { useEffect, useLayoutEffect, useMemo, useState } from "react"

import { useTheme } from "@/components/theme-context"

const editorThemeRefreshByShikiTheme = {
  "github-dark": {},
  "github-light": {},
}

export function useEditorShikiTheme() {
  const { theme } = useTheme()
  const resolvedTheme = useResolvedTheme(theme)
  const shikiTheme = resolvedTheme === "dark" ? "github-dark" : "github-light"
  const [shikiThemeSource] = useState(() => createShikiThemeSource(shikiTheme))
  const shikiThemeResolver = useMemo(
    () => shikiThemeSource.getTheme,
    [shikiThemeSource]
  )

  useLayoutEffect(() => {
    shikiThemeSource.setTheme(shikiTheme)
  }, [shikiTheme, shikiThemeSource])

  return {
    editorThemeRefresh: editorThemeRefreshByShikiTheme[shikiTheme],
    shikiThemeResolver,
  }
}

function createShikiThemeSource(initialTheme: string) {
  let theme = initialTheme

  return {
    getTheme: () => theme,
    setTheme: (nextTheme: string) => {
      theme = nextTheme
    },
  }
}

function useResolvedTheme(theme: "dark" | "light" | "system") {
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">(() =>
    systemThemePreference()
  )

  useEffect(() => {
    if (theme !== "system") return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => setSystemTheme(systemThemePreference())

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  if (theme === "system") return systemTheme
  return theme
}

function systemThemePreference(): "dark" | "light" {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark"
  return "light"
}
