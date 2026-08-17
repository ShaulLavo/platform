import type { LoadState } from '@/lib/load-state'
import { fetchQuickOpenFiles } from '@/lib/file-server'
import { fileSystemKeys } from '@/lib/query-keys'
import type { TreeModel } from '@/lib/tree-model'
import { useQuery } from '@tanstack/react-query'
import { useLayoutEffect, useState } from 'react'

import type { QuickAccessMode } from '@/features/command-palette/command-palette-types'
import {
  filePaletteItems,
  searchFilePaletteItems,
  selectedFileCommandValue,
} from '@/features/command-palette/command-palette-utils'

type UseCommandPaletteFilesOptions = {
  readonly mode: QuickAccessMode
  readonly open: boolean
  readonly query: string
  readonly rootPath: string | null
  readonly treeState: LoadState<TreeModel>
}

export function useCommandPaletteFiles({
  mode,
  open,
  query,
  rootPath,
  treeState,
}: UseCommandPaletteFilesOptions) {
  const [selectedFileItemValue, setSelectedFileItemValue] = useState<string | null>(null)
  const fileQuery = query.trim()
  const baseFileItems = filePaletteItems(treeState)
  const fileSearchEnabled = open && mode === 'files' && Boolean(rootPath && fileQuery)
  const fileSearchQuery = useQuery({
    enabled: fileSearchEnabled,
    queryFn: ({ signal }) =>
      fetchQuickOpenFiles({
        path: rootPath ?? '',
        query: fileQuery,
        signal,
      }),
    queryKey: fileSystemKeys.quickOpenFiles(rootPath ?? '', fileQuery),
    staleTime: 5_000,
  })
  const searchedFileItems = searchFilePaletteItems(fileSearchQuery.data ?? [], rootPath ?? '')
  const visibleFileItems = fileSearchEnabled ? searchedFileItems : baseFileItems
  const selectedCommandValue =
    mode === 'files' ? selectedFileCommandValue(selectedFileItemValue, visibleFileItems) : undefined

  useLayoutEffect(() => {
    if (!open || mode !== 'files') return
    //TODO this seems a bit hacky, do we even want to do this? if so use a ref at least
    document.querySelector<HTMLElement>('[data-slot="command-list"]')?.scrollTo({ top: 0 })
  }, [fileQuery, fileSearchQuery.data, mode, open])

  return {
    fileQuery,
    fileSearchQuery,
    selectedCommandValue,
    setSelectedFileItemValue,
    visibleFileItems,
  }
}
