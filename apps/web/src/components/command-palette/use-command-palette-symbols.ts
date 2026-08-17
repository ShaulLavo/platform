import {
  useEditorDocumentState,
  useEditorDocumentStoreApi,
} from '@/features/editor/state/document-state'
import { fetchDocumentSymbols } from '@/components/command-palette/document-symbols'
import { documentSymbolKeys } from '@/lib/query-keys'
import { useQuery } from '@tanstack/react-query'

import type { QuickAccessMode } from './command-palette-types'
import { fileBackedPath } from '@/keymap/command-enablement'

type UseCommandPaletteSymbolsOptions = {
  readonly mode: QuickAccessMode
  readonly rootPath: string | null
  readonly selectedFilePath: string | null
}

export function useCommandPaletteSymbols({
  mode,
  rootPath,
  selectedFilePath,
}: UseCommandPaletteSymbolsOptions) {
  const documentStore = useEditorDocumentStoreApi()
  const selectedFileBackedPath = fileBackedPath(selectedFilePath)
  const symbolsEnabled = mode === 'symbols' && Boolean(rootPath && selectedFileBackedPath)
  const selectedDocumentContentRevision = useEditorDocumentState((state) =>
    symbolsEnabled && selectedFileBackedPath
      ? (state.documentContentRevisions[selectedFileBackedPath] ?? null)
      : null,
  )
  const symbolQuery = useQuery({
    enabled: symbolsEnabled,
    queryFn: ({ signal }) => {
      const selectedDocument = selectedFileBackedPath
        ? documentStore.getState().liveDocumentsById[selectedFileBackedPath]
        : null

      return fetchDocumentSymbols({
        path: selectedFileBackedPath ?? '',
        rootPath: rootPath ?? '',
        signal,
        text: selectedDocument?.buffer.isDirty()
          ? selectedDocument.buffer.materializeFullText()
          : null,
      })
    },
    queryKey: documentSymbolKeys.document(
      rootPath ?? '',
      selectedFileBackedPath ?? '',
      selectedDocumentContentRevision ?? 'disk',
    ),
  })

  return {
    selectedFileBackedPath,
    symbolQuery,
    symbolsEnabled,
  }
}
