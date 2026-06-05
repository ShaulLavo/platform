import { useEffect, useEffectEvent, useMemo, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  EDITOR_TAB_PREFETCH_STALE_MS,
  editorTabElements,
  editorTabIntentPrefetchKey,
  editorTabPrefetchRegistrationKey,
  editorTabPrefetchTarget,
  type EditorTabPrefetchCandidate,
} from '@/components/workspace/editor-tabs/utils/editor-tab-prefetch'
import {
  createIntentPrefetchRegistry,
  type IntentPrefetchRegistry,
  type IntentPrefetchRow,
} from '@/components/workspace/shared/utils/intent-prefetch-registry'
import { createAnimationFrameScheduler } from '@/components/workspace/shared/utils/intent-prefetch-scheduler'
import { fileSnapshotQueryOptions } from '@/lib/file-snapshot-query-cache'
import { fetchFile } from '@/lib/file-server'

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
      ...fileSnapshotQueryOptions(path),
      queryFn: ({ signal }) => fetchFile(path, signal),
      staleTime: EDITOR_TAB_PREFETCH_STALE_MS,
    })
  })

  const syncRegistrations = useEffectEvent(
    (root: ParentNode, registry: IntentPrefetchRegistry<string>) => {
      registry.sync(editorTabElements(root), prefetchPath)
    },
  )

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    const root = tabListRef.current
    if (!root) return

    const registry = createIntentPrefetchRegistry({
      reactivateAfter: EDITOR_TAB_PREFETCH_STALE_MS,
      resolveRow: resolveEditorTabRow,
    })
    const schedule = createAnimationFrameScheduler(() => {
      syncRegistrations(root, registry)
    })
    const observer = observeEditorTabs(root, schedule.request)

    schedule.request()

    return () => {
      observer?.disconnect()
      schedule.cancel()
      registry.clear()
    }
  }, [enabled, registrationKey, tabListRef])
}

function resolveEditorTabRow(element: HTMLElement): IntentPrefetchRow<string> | null {
  const target = editorTabPrefetchTarget(element)
  if (!target) return null

  const key = editorTabPrefetchRegistrationKey(target)
  return {
    intent: target.path,
    key,
    meta: { path: target.path, tabId: target.id },
    name: `editor-tab:${key}`,
  }
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
