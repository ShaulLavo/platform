import type { EditorSyntaxLanguageId } from '@singapor/core'

const LANGUAGE_BY_EXTENSION: Record<string, EditorSyntaxLanguageId> = {
  '.babelrc': 'json',
  '.cjs': 'javascript',
  '.commitlintrc': 'json',
  '.css': 'css',
  '.cts': 'typescript',
  '.eslintrc': 'json',
  '.hintrc': 'json',
  '.htm': 'html',
  '.html': 'html',
  '.js': 'javascript',
  '.json': 'json',
  '.jsonc': 'json',
  '.lintstagedrc': 'json',
  '.lock': 'json',
  '.jsx': 'javascript',
  '.markdown': 'markdown',
  '.md': 'markdown',
  '.mjs': 'javascript',
  '.mts': 'typescript',
  '.prettierrc': 'json',
  '.releaserc': 'json',
  '.stylelintrc': 'json',
  '.swcrc': 'json',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.watchmanconfig': 'json',
}

export function languageIdForFilePath(filePath: string) {
  return LANGUAGE_BY_EXTENSION[extensionForFilePath(filePath)] ?? null
}

export function extensionForFilePath(filePath: string) {
  const dotIndex = filePath.lastIndexOf('.')
  if (dotIndex === -1) return ''

  return filePath.slice(dotIndex).toLowerCase()
}
