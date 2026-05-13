import { useEffect, useMemo, useState } from "react"
import type { EditorTheme } from "@editor/core"
import { loadShikiTheme } from "@editor/core/shiki"

import { useTheme } from "@/components/theme-context"

type ShikiThemeName = "github-dark" | "github-light"

const SHIKI_PRELOAD_THEMES = ["github-dark", "github-light"] as const

const fallbackEditorThemeByShikiTheme = {
  "github-dark": {
    backgroundColor: "#24292e",
    foregroundColor: "#e1e4e8",
    gutterBackgroundColor: "#24292e",
    gutterForegroundColor: "#444d56",
    caretColor: "#c8e1ff",
    syntax: {
      attribute: "#79b8ff",
      bracket: "#ffab70",
      comment: "#6a737d",
      constant: "#e1e4e8",
      function: "#79b8ff",
      keyword: "#e1e4e8",
      keywordDeclaration: "#e1e4e8",
      keywordImport: "#f97583",
      namespace: "#e1e4e8",
      number: "#79b8ff",
      property: "#e1e4e8",
      string: "#dbedff",
      type: "#79b8ff",
      typeDefinition: "#b392f0",
      typeParameter: "#b392f0",
      variable: "#e1e4e8",
      variableBuiltin: "#79b8ff",
    },
  },
  "github-light": {
    backgroundColor: "#fff",
    foregroundColor: "#24292e",
    gutterBackgroundColor: "#fff",
    gutterForegroundColor: "#1b1f234d",
    caretColor: "#044289",
    syntax: {
      attribute: "#005cc5",
      bracket: "#e36209",
      comment: "#6a737d",
      constant: "#24292e",
      function: "#005cc5",
      keyword: "#24292e",
      keywordDeclaration: "#24292e",
      keywordImport: "#d73a49",
      namespace: "#24292e",
      number: "#005cc5",
      property: "#24292e",
      string: "#032f62",
      type: "#005cc5",
      typeDefinition: "#6f42c1",
      typeParameter: "#6f42c1",
      variable: "#24292e",
      variableBuiltin: "#005cc5",
    },
  },
} satisfies Record<ShikiThemeName, EditorTheme>

export function useEditorShikiTheme() {
  const { theme } = useTheme()
  const resolvedTheme = useResolvedTheme(theme)
  const shikiTheme: ShikiThemeName =
    resolvedTheme === "dark" ? "github-dark" : "github-light"
  const [editorThemes, setEditorThemes] = useState<
    Partial<Record<ShikiThemeName, EditorTheme>>
  >({})
  const [shikiThemeSource] = useState(() => createShikiThemeSource(shikiTheme))
  const shikiThemeResolver = useMemo(
    () => shikiThemeSource.getTheme,
    [shikiThemeSource]
  )

  shikiThemeSource.setTheme(shikiTheme)

  useEffect(() => {
    let active = true

    loadShikiTheme({ theme: shikiTheme, themes: SHIKI_PRELOAD_THEMES })
      .then((editorTheme) => {
        if (!active || !editorTheme) return

        setEditorThemes((current) => {
          if (current[shikiTheme] === editorTheme) return current
          return { ...current, [shikiTheme]: editorTheme }
        })
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [shikiTheme])

  return {
    editorThemeRefresh:
      editorThemes[shikiTheme] ?? fallbackEditorThemeByShikiTheme[shikiTheme],
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
