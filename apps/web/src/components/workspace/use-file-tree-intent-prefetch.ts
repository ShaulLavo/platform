import type { FileTree as PierreFileTreeModel } from '@pierre/trees'
import { ForesightManager } from 'js.foresight'
import { useEffect, useEffectEvent, useLayoutEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  canPrefetchFileEntry,
  fileTreeRowElements,
  fileTreeRowPath,
  FILE_TREE_PREFETCH_STALE_MS,
} from '@/components/workspace/file-tree-prefetch'
import { createAnimationFrameScheduler } from '@/components/workspace/intent-prefetch-scheduler'
import { fetchFile } from '@/lib/file-server'
import type { TreeEntry } from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import { fileSystemKeys } from '@/lib/query-keys'
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
      queryFn: ({ signal }) => fetchFile(entry.path, signal),
      queryKey: fileSystemKeys.file(entry.path),
      staleTime: FILE_TREE_PREFETCH_STALE_MS,
    })
  })

  const syncRegistrations = useEffectEvent((registrations: Map<HTMLElement, string>) => {
    syncForesightRegistrations(tree, registrations, prefetchTreePath)
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const registrations = new Map<HTMLElement, string>()
    let observer: MutationObserver | null = null
    const schedule = createAnimationFrameScheduler(() => {
      observer ??= observeTreeRows(tree, schedule.request)
      syncRegistrations(registrations)
    })
    const unsubscribe = tree.subscribe(schedule.request)

    schedule.request()

    return () => {
      unsubscribe()
      observer?.disconnect()
      schedule.cancel()
      unregisterAll(registrations)
    }
  }, [tree])
}

function syncForesightRegistrations(
  tree: PierreFileTreeModel,
  registrations: Map<HTMLElement, string>,
  onIntent: (treePath: string) => void,
) {
  const shadowRoot = tree.getFileTreeContainer()?.shadowRoot
  if (!shadowRoot) {
    unregisterAll(registrations)
    return
  }

  const currentElements = new Set(fileTreeRowElements(shadowRoot))
  unregisterRemovedElements(registrations, currentElements)

  for (const element of currentElements) {
    registerElementPath(element, registrations, onIntent)
  }
}

function registerElementPath(
  element: HTMLElement,
  registrations: Map<HTMLElement, string>,
  onIntent: (treePath: string) => void,
) {
  const treePath = fileTreeRowPath(element)
  if (!treePath) {
    unregisterElement(element, registrations)
    return
  }

  const currentPath = registrations.get(element)
  if (currentPath === treePath) return
  if (currentPath) unregisterElement(element, registrations)

  ForesightManager.instance.register({
    callback: () => onIntent(treePath),
    element,
    meta: { treePath },
    name: `file-tree:${treePath}`,
    reactivateAfter: FILE_TREE_PREFETCH_STALE_MS,
  })
  registrations.set(element, treePath)
}

function unregisterRemovedElements(
  registrations: Map<HTMLElement, string>,
  currentElements: ReadonlySet<HTMLElement>,
) {
  for (const element of registrations.keys()) {
    if (currentElements.has(element)) continue

    unregisterElement(element, registrations)
  }
}

function unregisterAll(registrations: Map<HTMLElement, string>) {
  for (const element of registrations.keys()) {
    unregisterElement(element, registrations)
  }
}

function unregisterElement(element: HTMLElement, registrations: Map<HTMLElement, string>) {
  registrations.delete(element)
  if (!ForesightManager.isInitiated) return

  ForesightManager.instance.unregister(element)
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
