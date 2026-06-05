import type { FileTree as PierreFileTreeModel } from '@pierre/trees'
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  canPrefetchFileEntry,
  fileTreeRowElements,
  fileTreeRowPath,
  FILE_TREE_PREFETCH_STALE_MS,
} from '@/components/workspace/file-tree-prefetch'
import {
  createIntentPrefetchRegistry,
  type IntentPrefetchRegistry,
  type IntentPrefetchRow,
} from '@/components/workspace/intent-prefetch-registry'
import { createAnimationFrameScheduler } from '@/components/workspace/intent-prefetch-scheduler'
import { fileSnapshotQueryOptions } from '@/lib/file-snapshot-query-cache'
import { fetchFile } from '@/lib/file-server'
import type { TreeEntry } from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import { entryForTreePath, type TreeModel } from '@/lib/tree-model'

type FileTreeIntentPrefetchOptions = {
  model: TreeModel
  onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
  tree: PierreFileTreeModel
}

export function useFileTreeIntentPrefetch({
  model,
  onPrefetchDirectory,
  tree,
}: FileTreeIntentPrefetchOptions) {
  const queryClient = useQueryClient()
  const modelRef = useRef(model)

  useLayoutEffect(() => {
    modelRef.current = model
  }, [model])

  const prefetchTreePath = useEffectEvent((treePath: string) => {
    const entry = entryForTreePath(modelRef.current, treePath)
    if (!entry) return
    if (isDirectoryEntry(entry)) {
      onPrefetchDirectory(entry, `${treePath}/`)
      return
    }
    if (!canPrefetchFileEntry(entry)) return

    void queryClient.prefetchQuery({
      ...fileSnapshotQueryOptions(entry.path),
      queryFn: ({ signal }) => fetchFile(entry.path, signal),
      staleTime: FILE_TREE_PREFETCH_STALE_MS,
    })
  })

  const syncRegistrations = useEffectEvent((registry: IntentPrefetchRegistry<string>) => {
    const shadowRoot = tree.getFileTreeContainer()?.shadowRoot
    if (!shadowRoot) {
      registry.clear()
      return
    }

    registry.sync(fileTreeRowElements(shadowRoot), prefetchTreePath)
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const registry = createIntentPrefetchRegistry({
      reactivateAfter: FILE_TREE_PREFETCH_STALE_MS,
      resolveRow: resolveFileTreeRow,
    })
    let observer: MutationObserver | null = null
    const schedule = createAnimationFrameScheduler(() => {
      observer ??= observeTreeRows(tree, schedule.request)
      syncRegistrations(registry)
    })
    const unsubscribe = tree.subscribe(schedule.request)

    schedule.request()

    return () => {
      unsubscribe()
      observer?.disconnect()
      schedule.cancel()
      registry.clear()
    }
  }, [tree])
}

function resolveFileTreeRow(element: HTMLElement): IntentPrefetchRow<string> | null {
  const treePath = fileTreeRowPath(element)
  if (!treePath) return null

  return {
    intent: treePath,
    key: treePath,
    meta: { treePath },
    name: `file-tree:${treePath}`,
  }
}

function observeTreeRows(tree: PierreFileTreeModel, onChange: () => void): MutationObserver | null {
  if (typeof MutationObserver === 'undefined') return null

  const shadowRoot = tree.getFileTreeContainer()?.shadowRoot
  if (!shadowRoot) return null

  const observer = new MutationObserver(onChange)
  observer.observe(shadowRoot, {
    attributeFilter: ['data-item-path'],
    attributes: true,
    childList: true,
    subtree: true,
  })
  return observer
}
