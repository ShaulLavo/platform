/**
 * The protocol's name for a document, where it differs from the editor's.
 *
 * `languageIdForFilePath` returns shiki grammar names, and shiki has no JSX-flavoured TypeScript
 * grammar, so `.tsx` is `typescript` there. Sending that in `didOpen` makes tsserver parse the file
 * as ScriptKind TS: JSX becomes a syntax error and formatting mangles it.
 */
const LSP_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.jsx': 'javascriptreact',
  '.tsx': 'typescriptreact',
  '.jsonc': 'jsonc',
}

/** Known `.json` configuration files whose ecosystems permit comments. */
const JSONC_BASENAMES = new Set([
  '.babelrc.json',
  '.devcontainer.json',
  '.eslintrc.json',
  'babel.config.json',
  'devcontainer.json',
  'jsconfig.json',
  'tsconfig.json',
  'typedoc.json',
])

/** `tsconfig.build.json`, `jsconfig.app.json`, and the rest of the flavoured configs. */
const JSONC_BASENAME_PATTERN = /^[tj]sconfig\..+\.json$/

/** Directories whose `.json` files are all editor/tool config, comments included. */
const JSONC_DIRECTORIES = new Set(['.devcontainer', '.platform', '.vscode'])

/** Accepts a path or a file uri — only the last segment's extension is read. */
export function lspLanguageIdForPath(pathOrUri: string): string | undefined {
  const segments = pathOrUri.split('/')
  const name = (segments.at(-1) ?? '').toLowerCase()
  const extension = extensionFor(name)
  if (extension === '.json' && isJsoncDocument(name, segments)) return 'jsonc'

  return LSP_LANGUAGE_BY_EXTENSION[extension]
}

function isJsoncDocument(name: string, segments: readonly string[]) {
  if (JSONC_BASENAMES.has(name) || JSONC_BASENAME_PATTERN.test(name)) return true

  const parent = segments.at(-2)?.toLowerCase()
  return parent !== undefined && JSONC_DIRECTORIES.has(parent)
}

function extensionFor(name: string) {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return ''

  return name.slice(dotIndex)
}
