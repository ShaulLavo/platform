import { useCallback, useEffect, useState } from "react"
import type { EditorTheme } from "@editor/core"
import { loadShikiTheme } from "@editor/core/shiki"

import { useTheme } from "@/components/theme-context"

export type EditorColorMode = "dark" | "light"
export type EditorThemePalette = "tree-sitter" | "shiki"

type ShikiThemeName = "github-dark" | "github-light"

const SHIKI_PRELOAD_THEMES = ["github-dark", "github-light"] as const

const shikiThemeByColorMode = {
  dark: "github-dark",
  light: "github-light",
} satisfies Record<EditorColorMode, ShikiThemeName>

const treeSitterEditorThemeByColorMode = {
  dark: {
    backgroundColor: "#1e1e1e",
    foregroundColor: "#d4d4d4",
    gutterBackgroundColor: "#1e1e1e",
    gutterForegroundColor: "#71717a",
    caretColor: "#d4d4d4",
    minimapBackgroundColor: "#1e1e1e",
    syntax: {
      attribute: "#99f6e4",
      bracket: "#d4d4d8",
      comment: "#71717a",
      constant: "#f0abfc",
      function: "#fecdd3",
      keyword: "#6ee7b7",
      keywordDeclaration: "#a78bfa",
      keywordImport: "#f9a8d4",
      namespace: "#a5f3fc",
      number: "#c4b5fd",
      property: "#e9d5ff",
      string: "#fde68a",
      type: "#7dd3fc",
      typeDefinition: "#38bdf8",
      typeParameter: "#5eead4",
      variable: "#e4e4e7",
      variableBuiltin: "#fdba74",
    },
  },
  light: {
    backgroundColor: "#ffffff",
    foregroundColor: "#24292e",
    gutterBackgroundColor: "#ffffff",
    gutterForegroundColor: "#6e7781",
    caretColor: "#24292e",
    minimapBackgroundColor: "#ffffff",
    syntax: {
      attribute: "#0f766e",
      bracket: "#57606a",
      comment: "#6e7781",
      constant: "#8250df",
      function: "#be123c",
      keyword: "#15803d",
      keywordDeclaration: "#7e22ce",
      keywordImport: "#db2777",
      namespace: "#0891b2",
      number: "#7c3aed",
      property: "#6b21a8",
      string: "#92400e",
      type: "#0369a1",
      typeDefinition: "#0284c7",
      typeParameter: "#0f766e",
      variable: "#24292e",
      variableBuiltin: "#c2410c",
    },
  },
} satisfies Record<EditorColorMode, EditorTheme>

const fallbackShikiEditorThemeByColorMode = {
  dark: {
    backgroundColor: "#24292e",
    foregroundColor: "#e1e4e8",
    gutterBackgroundColor: "#24292e",
    gutterForegroundColor: "#444d56",
    caretColor: "#c8e1ff",
    minimapBackgroundColor: "#24292e",
    syntax: {
      attribute: "#b392f0",
      bracket: "#e1e4e8",
      comment: "#6a737d",
      constant: "#79b8ff",
      function: "#b392f0",
      keyword: "#f97583",
      keywordDeclaration: "#f97583",
      keywordImport: "#f97583",
      namespace: "#b392f0",
      number: "#79b8ff",
      property: "#79b8ff",
      string: "#9ecbff",
      type: "#79b8ff",
      typeDefinition: "#b392f0",
      typeParameter: "#b392f0",
      variable: "#e1e4e8",
      variableBuiltin: "#79b8ff",
    },
  },
  light: {
    backgroundColor: "#fff",
    foregroundColor: "#24292e",
    gutterBackgroundColor: "#fff",
    gutterForegroundColor: "#1b1f234d",
    caretColor: "#044289",
    minimapBackgroundColor: "#fff",
    syntax: {
      attribute: "#6f42c1",
      bracket: "#24292e",
      comment: "#6a737d",
      constant: "#005cc5",
      function: "#6f42c1",
      keyword: "#d73a49",
      keywordDeclaration: "#d73a49",
      keywordImport: "#d73a49",
      namespace: "#6f42c1",
      number: "#005cc5",
      property: "#005cc5",
      string: "#032f62",
      type: "#005cc5",
      typeDefinition: "#6f42c1",
      typeParameter: "#6f42c1",
      variable: "#24292e",
      variableBuiltin: "#005cc5",
    },
  },
} satisfies Record<EditorColorMode, EditorTheme>

export function useEditorColorTheme({
  palette = "tree-sitter",
}: {
  readonly palette?: EditorThemePalette
} = {}) {
  const { theme } = useTheme()
  const colorMode = useResolvedTheme(theme)
  const shikiTheme = shikiThemeByColorMode[colorMode]
  const shikiThemeResolver = useCallback(() => shikiTheme, [shikiTheme])
  const [shikiEditorThemes, setShikiEditorThemes] = useState<
    Partial<Record<ShikiThemeName, EditorTheme>>
  >({})

  useEffect(() => {
    if (palette !== "shiki") return

    let active = true

    loadShikiTheme({ theme: shikiTheme, themes: SHIKI_PRELOAD_THEMES })
      .then((editorTheme) => {
        if (!active || !editorTheme) return

        setShikiEditorThemes((current) => {
          if (current[shikiTheme] === editorTheme) return current
          return { ...current, [shikiTheme]: editorTheme }
        })
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [palette, shikiTheme])

  return {
    colorMode,
    editorTheme: editorThemeForPalette({
      colorMode,
      palette,
      shikiEditorThemes,
      shikiTheme,
    }),
    shikiTheme,
    shikiThemeResolver,
  }
}

function editorThemeForPalette({
  colorMode,
  palette,
  shikiEditorThemes,
  shikiTheme,
}: {
  readonly colorMode: EditorColorMode
  readonly palette: EditorThemePalette
  readonly shikiEditorThemes: Partial<Record<ShikiThemeName, EditorTheme>>
  readonly shikiTheme: ShikiThemeName
}): EditorTheme {
  if (palette === "tree-sitter")
    return treeSitterEditorThemeByColorMode[colorMode]

  return (
    shikiEditorThemes[shikiTheme] ??
    fallbackShikiEditorThemeByColorMode[colorMode]
  )
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
