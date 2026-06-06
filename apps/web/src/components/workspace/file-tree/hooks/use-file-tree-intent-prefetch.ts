import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  canPrefetchFileEntry,
  fileTreeRowElements,
  fileTreeRowPath,
} from '@/components/workspace/file-tree/utils/file-tree-prefetch'
import {
  createIntentPrefetchRegistry,
  INTENT_PREFETCH_HIT_SLOP_PX,
  type IntentPrefetchRegistry,
  type IntentPrefetchRow,
} from '@/components/workspace/shared/utils/intent-prefetch-registry'
import { createAnimationFrameScheduler } from '@/components/workspace/shared/utils/intent-prefetch-scheduler'
import {
  FILE_SNAPSHOT_INTENT_PREFETCH_STALE_MS,
  prefetchFileSnapshotQuery,
} from '@/lib/file-snapshot-query-cache'
import type { TreeEntry } from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import { entryForTreePath, type TreeModel } from '@/lib/tree-model'
import type { FileTree } from '@workspace/tree/utils/render/FileTree'

type FileTreeIntentPrefetchOptions = {
  model: TreeModel
  onPrefetchDirectory: (entry: TreeEntry, treePath: string) => void
  tree: FileTree
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

    void prefetchFileSnapshotQuery(queryClient, entry.path)
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
      hitSlop: INTENT_PREFETCH_HIT_SLOP_PX,
      reactivateAfter: FILE_SNAPSHOT_INTENT_PREFETCH_STALE_MS,
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

function observeTreeRows(tree: FileTree, onChange: () => void): MutationObserver | null {
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
