import { VSCODE_THEMES, type ShikiLanguageMap } from '@singapor/core/shiki'

/**
 * Shiki language ids the app uses directly as editor language ids in
 * `file-path.ts`. They map to themselves for the shiki highlighter. The
 * tree-sitter-backed ids (javascript, typescript, css, html, json) stay out of
 * this map on purpose: the plugin's default map already resolves them, and an
 * explicit entry would shadow its `.jsx`/`.tsx` document-extension handling.
 */
const SHIKI_NATIVE_LANGUAGE_IDS = [
  'c',
  'cpp',
  'csharp',
  'dart',
  'diff',
  'dockerfile',
  'elixir',
  'go',
  'graphql',
  'ini',
  'java',
  'kotlin',
  'lua',
  'makefile',
  'php',
  'powershell',
  'python',
  'r',
  'ruby',
  'rust',
  'scala',
  'shellscript',
  'sql',
  'svelte',
  'swift',
  'terraform',
  'toml',
  'vue',
  'xml',
  'yaml',
] as const

export const EDITOR_SHIKI_LANGUAGE_MAP: ShikiLanguageMap = {
  markdown: 'markdown',
  ...Object.fromEntries(SHIKI_NATIVE_LANGUAGE_IDS.map((id) => [id, id])),
}

/**
 * The worker cache-keys a highlighter on its theme set exactly as it does on its
 * language set, so naming every bundled theme up front is what makes a theme
 * swap re-tokenize against a highlighter it already has instead of building a
 * fresh one. Building one costs ~400ms; re-tokenizing costs ~60ms, which is the
 * difference between a live preview and a slideshow.
 */
export const EDITOR_SHIKI_PRELOAD_THEMES: readonly string[] = VSCODE_THEMES.map(
  (theme) => theme.shikiName,
)

// The worker cache-keys a highlighter on its language set, so preloading every
// language the app can produce keeps all documents on one shared instance.
export const EDITOR_SHIKI_PRELOAD_LANGUAGES: readonly string[] = [
  'css',
  'html',
  'javascript',
  'json',
  'jsx',
  'markdown',
  'tsx',
  'typescript',
  ...SHIKI_NATIVE_LANGUAGE_IDS,
]
