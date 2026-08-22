import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { FileTreeView } from '@workspace/tree/components/FileTreeView'
import type { FileTreeViewProps } from '@workspace/tree/utils/model/internalTypes'

interface RootState {
  controller: FileTreeViewProps['controller']
  generation: number
  readonly root: Root
  pendingUnmountToken: object | null
}

const roots = new WeakMap<HTMLElement, RootState>()

function getOrCreateRootState(
  element: HTMLElement,
  controller: FileTreeViewProps['controller'],
): RootState {
  const currentState = roots.get(element)
  if (currentState != null) return currentState

  const nextState: RootState = {
    controller,
    generation: 0,
    pendingUnmountToken: null,
    root: createRoot(element),
  }
  roots.set(element, nextState)
  return nextState
}

export function renderFileTreeRoot(element: HTMLElement, props: FileTreeViewProps): void {
  const state = getOrCreateRootState(element, props.controller)
  state.pendingUnmountToken = null
  if (state.controller !== props.controller) {
    state.controller = props.controller
    state.generation += 1
  }
  state.root.render(createElement(FileTreeView, { ...props, key: state.generation }))
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
