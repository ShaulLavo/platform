import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { FileTreeView } from '@workspace/tree/components/FileTreeView'
import type { FileTreeViewProps } from '@workspace/tree/utils/model/internalTypes'

interface RootState {
  readonly root: Root
  pendingUnmountToken: object | null
}

const roots = new WeakMap<HTMLElement, RootState>()

function getOrCreateRootState(element: HTMLElement): RootState {
  const currentState = roots.get(element)
  if (currentState != null) return currentState

  const nextState: RootState = {
    pendingUnmountToken: null,
    root: createRoot(element),
  }
  roots.set(element, nextState)
  return nextState
}

export function renderFileTreeRoot(element: HTMLElement, props: FileTreeViewProps): void {
  const state = getOrCreateRootState(element)
  state.pendingUnmountToken = null
  state.root.render(createElement(FileTreeView, props))
}

export function unmountFileTreeRoot(element: HTMLElement): void {
  const state = roots.get(element)
  if (state == null) return

  const token = {}
  state.pendingUnmountToken = token
  queueMicrotask(() => {
    const currentState = roots.get(element)
    if (currentState !== state || currentState.pendingUnmountToken !== token) return

    currentState.root.unmount()
    roots.delete(element)
  })
}
