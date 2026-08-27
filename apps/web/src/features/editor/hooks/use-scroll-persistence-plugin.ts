import type { EditorPlugin, EditorScrollPosition, EditorViewSnapshot } from '@singapor/core'
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

import type { EditorRenderDocument } from '@/features/editor/utils/render-document'
import { capOverscrollTop } from '@/features/editor/utils/scroll-position'
import { editorPerformanceFeatureDisabled } from '@/features/editor/state/performance-trace'

type UseScrollPersistencePluginOptions = {
  document: Pick<EditorRenderDocument, 'path'>
  onScrollPositionChange?: (path: string, scrollPosition: EditorScrollPosition) => void
}

type ScrollPersistenceState = {
  path: string
  onChange?: (path: string, scrollPosition: EditorScrollPosition) => void
}

type PendingScrollPosition = {
  left: number
  onChange: ScrollPersistenceState['onChange']
  path: string
  top: number
}

export function useScrollPersistencePlugin({
  document,
  onScrollPositionChange,
}: UseScrollPersistencePluginOptions) {
  const stateRef = useRef<ScrollPersistenceState>({
    onChange: onScrollPositionChange,
    path: document.path,
  })

  useLayoutEffect(() => {
    stateRef.current = {
      onChange: onScrollPositionChange,
      path: document.path,
    }
  }, [document.path, onScrollPositionChange])

  return useMemo<EditorPlugin>(
    () => ({
      name: 'platform-scroll-persistence',
      activate: (context) => {
        if (editorPerformanceFeatureDisabled('scroll-persistence')) return undefined

        return context.registerViewContribution({
          createContribution: () => {
            const persister = createScrollPositionPersister(stateRef)
            return {
              update: (snapshot) => persister.persistSnapshot(snapshot),
              dispose: () => persister.dispose(),
            }
          },
        })
      },
    }),
    [],
  )
}

// Scroll offsets come from the snapshot (editor tracked state, never the
// DOM), but the store write is flushed on the next animation frame: updates
// arrive synchronously inside the editor's scroll render pass, and notifying
// React subscribers there puts their work back into the hot frame.
function createScrollPositionPersister(stateRef: RefObject<ScrollPersistenceState>) {
  let lastPath = ''
  let lastLeft = -1
  let lastTop = -1
  let pending: PendingScrollPosition | null = null
  let frame: number | null = null

  const flush = () => {
    frame = null
    const next = pending
    pending = null
    if (!next) return
    if (next.path === lastPath && next.left === lastLeft && next.top === lastTop) {
      return
    }

    lastPath = next.path
    lastLeft = next.left
    lastTop = next.top
    next.onChange?.(next.path, { left: next.left, top: next.top })
  }

  return {
    persistSnapshot: (snapshot: EditorViewSnapshot) => {
      // The ref can move to another tab before this frame flushes.
      const state = stateRef.current
      pending = {
        left: snapshot.viewport.scrollLeft,
        onChange: state.onChange,
        path: snapshot.documentId ?? state.path,
        top: capOverscrollTop(snapshot.viewport.scrollTop, snapshot),
      }
      if (frame !== null) return
      if (pending.path === lastPath && pending.left === lastLeft && pending.top === lastTop) return

      frame = requestAnimationFrame(flush)
    },
    dispose: () => {
      if (frame === null) return

      cancelAnimationFrame(frame)
      frame = null
      flush()
    },
  }
}
