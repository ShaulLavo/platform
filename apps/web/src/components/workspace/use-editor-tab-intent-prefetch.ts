import { ForesightManager } from 'js.foresight'
import { useEffect, useEffectEvent, useMemo, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  EDITOR_TAB_PREFETCH_STALE_MS,
  editorTabElements,
  editorTabIntentPrefetchKey,
  editorTabPrefetchRegistrationKey,
  editorTabPrefetchTarget,
  type EditorTabPrefetchCandidate,
} from '@/components/workspace/editor-tab-prefetch'
import { createAnimationFrameScheduler } from '@/components/workspace/intent-prefetch-scheduler'
import { fetchFile } from '@/lib/file-server'
import { fileSystemKeys } from '@/lib/query-keys'

type EditorTabIntentPrefetchOptions<TElement extends HTMLElement> = {
  enabled: boolean
  tabListRef: RefObject<TElement | null>
  tabs: readonly EditorTabPrefetchCandidate[]
}

export function useEditorTabIntentPrefetch<TElement extends HTMLElement = HTMLElement>({
  enabled,
  tabListRef,
  tabs,
}: EditorTabIntentPrefetchOptions<TElement>) {
  const queryClient = useQueryClient()
  const registrationKey = useMemo(() => editorTabIntentPrefetchKey(tabs), [tabs])

  const prefetchPath = useEffectEvent((path: string) => {
    void queryClient.prefetchQuery({
      queryFn: ({ signal }) => fetchFile(path, signal),
      queryKey: fileSystemKeys.file(path),
      staleTime: EDITOR_TAB_PREFETCH_STALE_MS,
    })
  })

  const syncRegistrations = useEffectEvent(
    (root: ParentNode, registrations: Map<HTMLElement, string>) => {
      syncForesightRegistrations(root, registrations, prefetchPath)
    },
  )

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    const root = tabListRef.current
    if (!root) return

    const registrations = new Map<HTMLElement, string>()
    const schedule = createAnimationFrameScheduler(() => {
      syncRegistrations(root, registrations)
    })
    const observer = observeEditorTabs(root, schedule.request)

    schedule.request()

    return () => {
      observer?.disconnect()
      schedule.cancel()
      unregisterAll(registrations)
    }
  }, [enabled, registrationKey, tabListRef])
}

function syncForesightRegistrations(
  root: ParentNode,
  registrations: Map<HTMLElement, string>,
  onIntent: (path: string) => void,
) {
  const currentElements = new Set(editorTabElements(root))
  unregisterRemovedElements(registrations, currentElements)

  for (const element of currentElements) {
    registerElementPath(element, registrations, onIntent)
  }
}

function registerElementPath(
  element: HTMLElement,
  registrations: Map<HTMLElement, string>,
  onIntent: (path: string) => void,
) {
  const target = editorTabPrefetchTarget(element)
  if (!target) {
    unregisterElement(element, registrations)
    return
  }

  const key = editorTabPrefetchRegistrationKey(target)
  const currentKey = registrations.get(element)
  if (currentKey === key) return
  if (currentKey) unregisterElement(element, registrations)

  ForesightManager.instance.register({
    callback: () => onIntent(target.path),
    element,
    meta: { path: target.path, tabId: target.id },
    name: `editor-tab:${key}`,
    reactivateAfter: EDITOR_TAB_PREFETCH_STALE_MS,
  })
  registrations.set(element, key)
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

function observeEditorTabs(root: HTMLElement, onChange: () => void): MutationObserver | null {
  if (typeof MutationObserver === 'undefined') return null

  const observer = new MutationObserver(onChange)
  observer.observe(root, {
    attributeFilter: ['data-editor-tab-id', 'data-editor-tab-path'],
    attributes: true,
    childList: true,
    subtree: true,
  })
  return observer
}
