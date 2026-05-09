import type {
  EditorPlugin,
  EditorScrollPosition,
  EditorViewSnapshot,
} from "@editor/core"
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react"

import type { CachedEditorDocument } from "@/features/editor/state/editor-document-state"

type UseScrollPersistencePluginOptions = {
  document: CachedEditorDocument
  onScrollPositionChange?: (
    path: string,
    scrollPosition: NonNullable<CachedEditorDocument["scrollPosition"]>
  ) => void
}

type ScrollPersistenceState = {
  path: string
  onChange?: (path: string, scrollPosition: EditorScrollPosition) => void
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
      name: "platform-scroll-persistence",
      activate: (context) =>
        context.registerViewContribution({
          createContribution: ({ scrollElement }) => {
            const persister = createScrollPositionPersister(
              stateRef,
              scrollElement
            )
            scrollElement.addEventListener("scroll", persister.handleScroll, {
              passive: true,
            })

            return {
              update: (snapshot) =>
                persistSnapshotScrollPosition(
                  stateRef.current,
                  snapshot,
                  persister.activeDocumentChanged
                ),
              dispose: () =>
                scrollElement.removeEventListener(
                  "scroll",
                  persister.handleScroll
                ),
            }
          },
        }),
    }),
    []
  )
}

export function scrollPositionFromSnapshot(
  snapshot: EditorViewSnapshot | null
): EditorScrollPosition | null {
  if (!snapshot) return null

  return {
    left: snapshot.viewport.scrollLeft,
    top: snapshot.viewport.scrollTop,
  }
}

function createScrollPositionPersister(
  stateRef: RefObject<ScrollPersistenceState>,
  scrollElement: HTMLElement
) {
  let activePath = stateRef.current.path
  let lastPath = ""
  let lastLeft = -1
  let lastTop = -1

  const handleScroll = () => {
    const state = stateRef.current
    const left = scrollElement.scrollLeft
    const top = scrollElement.scrollTop
    if (activePath === lastPath && left === lastLeft && top === lastTop) {
      return
    }

    lastPath = activePath
    lastLeft = left
    lastTop = top
    state.onChange?.(activePath, { left, top })
  }

  return {
    activeDocumentChanged: (path: string) => {
      activePath = path
    },
    handleScroll,
  }
}

function persistSnapshotScrollPosition(
  state: ScrollPersistenceState,
  snapshot: EditorViewSnapshot,
  activeDocumentChanged: (path: string) => void
) {
  const path = snapshot.documentId ?? state.path
  activeDocumentChanged(path)
  state.onChange?.(path, {
    left: snapshot.viewport.scrollLeft,
    top: snapshot.viewport.scrollTop,
  })
}
