export function fallbackDocumentPathForSelection(
  hasCachedDocument: (path: string) => boolean,
  selectedFilePath: string | null,
  fallbackDocumentPath: string | null,
) {
  if (selectedFilePath && hasCachedDocument(selectedFilePath)) {
    return selectedFilePath
  }
  if (fallbackDocumentPath && hasCachedDocument(fallbackDocumentPath)) {
    return fallbackDocumentPath
  }

  return null
}
