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
}

/** Accepts a path or a file uri — only the last segment's extension is read. */
export function lspLanguageIdForPath(pathOrUri: string): string | undefined {
  return LSP_LANGUAGE_BY_EXTENSION[extensionFor(pathOrUri)]
}

function extensionFor(pathOrUri: string) {
  const name = pathOrUri.slice(pathOrUri.lastIndexOf('/') + 1)
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return ''

  return name.slice(dotIndex).toLowerCase()
}
