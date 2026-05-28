import type { EditorTheme } from '@editor/core'
import { editorThemeToShikiTheme } from '@editor/core/shiki'
import {
  createCodePlugin,
  type CodeHighlighterPlugin,
  type HighlightResult,
  type ThemeInput,
} from '@streamdown/code'

export type StreamdownEditorColorMode = 'dark' | 'light'

type HighlightTokenWithStyle = {
  content?: string
  htmlStyle?: Record<string, string | undefined>
}

const CSS_CUSTOM_PROPERTY_LANGUAGES = new Set(['astro', 'css', 'html', 'sass', 'scss', 'svelte'])

const FALLBACK_THEME_BY_COLOR_MODE = {
  dark: { background: '#1e1e1e', foreground: '#d4d4d4' },
  light: { background: '#ffffff', foreground: '#24292e' },
} satisfies Record<StreamdownEditorColorMode, { background: string; foreground: string }>

export function streamdownThemesForEditorTheme(
  theme: EditorTheme,
  colorMode: StreamdownEditorColorMode,
): [ThemeInput, ThemeInput] {
  return [
    streamdownThemeFromEditorTheme(theme, colorMode, 'light'),
    streamdownThemeFromEditorTheme(theme, colorMode, 'dark'),
  ]
}

export function createStreamdownEditorCodePlugin(
  themes: [ThemeInput, ThemeInput],
  editorTheme: EditorTheme,
): CodeHighlighterPlugin {
  const codePlugin = createCodePlugin({ themes })

  return {
    ...codePlugin,
    getThemes: () => themes,
    highlight(options, callback) {
      const result = codePlugin.highlight(
        { ...options, themes },
        callback
          ? (highlightResult) =>
              callback(
                normalizeStreamdownTokenColors(highlightResult, options.language, editorTheme),
              )
          : undefined,
      )

      return result ? normalizeStreamdownTokenColors(result, options.language, editorTheme) : result
    },
  }
}

function streamdownThemeFromEditorTheme(
  theme: EditorTheme,
  colorMode: StreamdownEditorColorMode,
  shikiColorMode: StreamdownEditorColorMode,
): ThemeInput {
  const fallback = FALLBACK_THEME_BY_COLOR_MODE[colorMode]

  return editorThemeToShikiTheme(theme, {
    fallbackBackground: fallback.background,
    fallbackForeground: fallback.foreground,
    type: shikiColorMode,
  }) as ThemeInput
}

function normalizeStreamdownTokenColors(
  result: HighlightResult,
  language: string,
  theme: EditorTheme,
): HighlightResult {
  for (const line of result.tokens) {
    for (const token of line as HighlightTokenWithStyle[]) {
      normalizeTokenColor(token, language, theme)
    }
  }

  return result
}

function normalizeTokenColor(token: HighlightTokenWithStyle, language: string, theme: EditorTheme) {
  const activeColor = token.htmlStyle?.['--shiki-dark']
  if (activeColor && token.htmlStyle) token.htmlStyle.color = activeColor

  if (!shouldNormalizeCssCustomProperties(language)) return
  if (!isCssCustomPropertyDeclarationToken(token.content)) return

  const propertyColor = theme.syntax?.property
  if (!propertyColor) return

  token.htmlStyle ??= {}
  token.htmlStyle.color = propertyColor
  token.htmlStyle['--shiki-dark'] = propertyColor
}

function shouldNormalizeCssCustomProperties(language: string) {
  return CSS_CUSTOM_PROPERTY_LANGUAGES.has(language.toLowerCase())
}

function isCssCustomPropertyDeclarationToken(content: string | undefined) {
  return /^\s*--[\w-]+\s*:/u.test(content ?? '')
}
