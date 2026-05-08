import type { EditorSyntaxLanguageId } from "@editor/core"

const LANGUAGE_BY_EXTENSION: Record<string, EditorSyntaxLanguageId> = {
  ".cjs": "javascript",
  ".css": "css",
  ".cts": "typescript",
  ".htm": "html",
  ".html": "html",
  ".js": "javascript",
  ".json": "json",
  ".jsx": "javascript",
  ".markdown": "markdown",
  ".md": "markdown",
  ".mjs": "javascript",
  ".mts": "typescript",
  ".ts": "typescript",
  ".tsx": "typescript",
}

export function languageIdForFilePath(filePath: string) {
  return LANGUAGE_BY_EXTENSION[extensionForFilePath(filePath)] ?? null
}

export function extensionForFilePath(filePath: string) {
  const dotIndex = filePath.lastIndexOf(".")
  if (dotIndex === -1) return ""

  return filePath.slice(dotIndex).toLowerCase()
}
