import type { FsEntry } from '@/lib/file-system-types'
import type { UseQueryResult } from '@tanstack/react-query'

import { errorMessage, loadingLoadState, type LoadState } from './model'

import type { DirectoryLoadData } from './data-helpers'

export function directoryLoadState(
  query: UseQueryResult<DirectoryLoadData>,
  enabled: boolean,
): LoadState {
  if (!enabled) return { status: 'loading' }
  if (query.isError) return { status: 'error', message: errorMessage(query.error) }
  if (query.isPlaceholderData && query.data) {
    return loadingLoadState({ status: 'ready', entries: query.data.entries })
  }
  if (query.data) return { status: 'ready', entries: query.data.entries }
  if (query.isPending) return { status: 'loading' }

  return { status: 'idle' }
}

export function entriesLoadState(query: UseQueryResult<FsEntry[]>, enabled: boolean): LoadState {
  if (!enabled) return { status: 'loading' }
  if (query.data) return { status: 'ready', entries: query.data }
  if (query.isError) return { status: 'error', message: errorMessage(query.error) }
  if (query.isPending) return { status: 'loading' }

  return { status: 'idle' }
}
