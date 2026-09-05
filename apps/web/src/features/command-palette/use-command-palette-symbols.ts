import { clientForQueryClient } from '@/lib/environments/state/query-clients'
import {
  useEditorDocumentState,
  useEditorDocumentStoreApi,
} from '@/features/editor/state/document-state'
import { fetchDocumentSymbols } from '@/features/command-palette/document-symbols'
import { fileBackedDocumentPath } from '@/features/editor/utils/file-backed-document'
import { documentSymbolKeys } from '@/lib/query-keys'
import { useQuery } from '@tanstack/react-query'

import type { QuickAccessMode } from '@/features/command-palette/command-palette-types'

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
  const selectedFileBackedPath = fileBackedDocumentPath(selectedFilePath)
  const symbolsEnabled = mode === 'symbols' && Boolean(rootPath && selectedFileBackedPath)
  const selectedDocumentContentRevision = useEditorDocumentState((state) =>
    symbolsEnabled && selectedFileBackedPath
      ? (state.documentContentRevisions[selectedFileBackedPath] ?? null)
      : null,
  )
  const symbolQuery = useQuery({
    enabled: symbolsEnabled,
    queryFn: ({ signal, client }) => {
      const selectedDocument = selectedFileBackedPath
        ? documentStore.getState().liveDocumentsById[selectedFileBackedPath]
        : null

      return fetchDocumentSymbols(
        {
          path: selectedFileBackedPath ?? '',
          rootPath: rootPath ?? '',
          signal,
          text: selectedDocument?.buffer.isDirty()
            ? selectedDocument.buffer.materializeFullText()
            : null,
        },
        clientForQueryClient(client),
      )
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
