import type { EditorSyntaxLanguageId } from '@singapor/core'

/**
 * Language ids the app can hand to the editor. The js/ts/html/css/json/markdown
 * ids double as tree-sitter language ids (folds/brackets); the rest are shiki's
 * own ids — they feed the shiki highlighter's `languages` map as identity
 * entries, so every value here must be a real shiki language name.
 */
const LANGUAGE_BY_EXTENSION: Record<string, EditorSyntaxLanguageId> = {
  '.babelrc': 'json',
  '.bash': 'shellscript',
  '.c': 'c',
  '.cc': 'cpp',
  '.cfg': 'ini',
  '.cjs': 'javascript',
  '.commitlintrc': 'json',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.css': 'css',
  '.cts': 'typescript',
  '.cxx': 'cpp',
  '.dart': 'dart',
  '.diff': 'diff',
  '.eslintrc': 'json',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.go': 'go',
  '.gql': 'graphql',
  '.graphql': 'graphql',
  '.h': 'c',
  '.hh': 'cpp',
  '.hintrc': 'json',
  '.hpp': 'cpp',
  '.htm': 'html',
  '.html': 'html',
  '.ini': 'ini',
  '.java': 'java',
  '.js': 'javascript',
  '.json': 'json',
  '.jsonc': 'json',
  '.jsx': 'javascript',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.lintstagedrc': 'json',
  '.lock': 'json',
  '.lua': 'lua',
  '.markdown': 'markdown',
  '.md': 'markdown',
  '.mjs': 'javascript',
  '.mk': 'makefile',
  '.mts': 'typescript',
  '.patch': 'diff',
  '.php': 'php',
  '.prettierrc': 'json',
  '.ps1': 'powershell',
  '.py': 'python',
  '.r': 'r',
  '.rb': 'ruby',
  '.releaserc': 'json',
  '.rs': 'rust',
  '.scala': 'scala',
  '.sh': 'shellscript',
  '.sql': 'sql',
  '.stylelintrc': 'json',
  '.svelte': 'svelte',
  '.swcrc': 'json',
  '.swift': 'swift',
  '.tf': 'terraform',
  '.toml': 'toml',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.vue': 'vue',
  '.watchmanconfig': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.zsh': 'shellscript',
}

const LANGUAGE_BY_BASENAME: Record<string, EditorSyntaxLanguageId> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
}

export function languageIdForFilePath(filePath: string) {
  return (
    LANGUAGE_BY_BASENAME[basenameForFilePath(filePath)] ??
    LANGUAGE_BY_EXTENSION[extensionForFilePath(filePath)] ??
    null
  )
}

function basenameForFilePath(filePath: string) {
  const slashIndex = filePath.lastIndexOf('/')
  return filePath.slice(slashIndex + 1).toLowerCase()
}

function extensionForFilePath(filePath: string) {
  const dotIndex = filePath.lastIndexOf('.')
  if (dotIndex === -1) return ''

  return filePath.slice(dotIndex).toLowerCase()
}
