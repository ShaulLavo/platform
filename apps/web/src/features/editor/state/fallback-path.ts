export function fallbackDocumentPathForSelection(
  hasLiveDocument: (path: string) => boolean,
  selectedFilePath: string | null,
  fallbackDocumentPath: string | null,
) {
  if (selectedFilePath && hasLiveDocument(selectedFilePath)) {
    return selectedFilePath
  }
  if (fallbackDocumentPath && hasLiveDocument(fallbackDocumentPath)) {
    return fallbackDocumentPath
  }

  return null
}
