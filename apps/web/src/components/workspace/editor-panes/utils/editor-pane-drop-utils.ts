import type { CSSProperties, DragEvent as ReactDragEvent } from 'react'

import {
  canSplitEditorPaneAtPane,
  canSplitEditorPaneAtRoot,
  type EditorPaneLayout,
} from '@/features/editor/state/editor-pane-state'
import type {
  EditorPaneSplitDropTarget,
  EditorPaneSplitDropZone,
} from '@/components/workspace/file-tree/utils/file-viewer-types'

const EDITOR_PANE_ROOT_EDGE_FRACTION = 0.28
const EDITOR_PANE_ROOT_EDGE_MIN_PX = 96
const EDITOR_PANE_ROOT_EDGE_MAX_PX = 180

export function eventTargetsEditorTabBar(event: ReactDragEvent<HTMLElement>) {
  if (!(event.target instanceof Element)) return false

  return Boolean(event.target.closest("[data-editor-tab-id], [role='tablist']"))
}

export function dropZonePreviewStyle(zone: EditorPaneSplitDropZone): CSSProperties {
  const inset = 8

  if (zone === 'left') {
    return {
      bottom: inset,
      left: inset,
      top: inset,
      width: `calc(50% - ${inset}px)`,
    }
  }
  if (zone === 'right') {
    return {
      bottom: inset,
      right: inset,
      top: inset,
      width: `calc(50% - ${inset}px)`,
    }
  }
  if (zone === 'top') {
    return {
      height: `calc(50% - ${inset}px)`,
      left: inset,
      right: inset,
      top: inset,
    }
  }

  return {
    bottom: inset,
    height: `calc(50% - ${inset}px)`,
    left: inset,
    right: inset,
  }
}

export function editorPaneDropTarget({
  event,
  layout,
  paneElement,
  paneId,
  surfaceElement,
}: {
  event: Pick<ReactDragEvent<HTMLElement>, 'clientX' | 'clientY'>
  layout: EditorPaneLayout
  paneElement: HTMLElement
  paneId: string
  surfaceElement: HTMLElement | null
}): EditorPaneSplitDropTarget | null {
  const rootZone = surfaceElement ? editorPaneRootEdgeDropZone(surfaceElement, event) : null

  if (rootZone && canSplitEditorPaneAtRoot(layout)) {
    return {
      paneId,
      scope: 'root',
      zone: rootZone,
    }
  }

  if (!canSplitEditorPaneAtPane(layout, paneId)) return null

  return {
    paneId,
    scope: 'pane',
    zone: editorPaneDropZone(paneElement, event),
  }
}

function editorPaneDropZone(
  element: HTMLElement,
  event: Pick<ReactDragEvent<HTMLElement>, 'clientX' | 'clientY'>,
): EditorPaneSplitDropZone {
  const rect = element.getBoundingClientRect()
  const x = normalizedPointerOffset(event.clientX, rect.left, rect.width)
  const y = normalizedPointerOffset(event.clientY, rect.top, rect.height)
  const distances: Array<{
    distance: number
    zone: EditorPaneSplitDropZone
  }> = [
    { distance: x, zone: 'left' },
    { distance: 1 - x, zone: 'right' },
    { distance: y, zone: 'top' },
    { distance: 1 - y, zone: 'bottom' },
  ]
  distances.sort((left, right) => left.distance - right.distance)

  return distances[0]?.zone ?? 'right'
}

function editorPaneRootEdgeDropZone(
  element: HTMLElement,
  event: Pick<ReactDragEvent<HTMLElement>, 'clientX' | 'clientY'>,
): EditorPaneSplitDropZone | null {
  const rect = element.getBoundingClientRect()
  const threshold = editorPaneRootEdgeThreshold(rect)
  const distances: Array<{
    distance: number
    zone: EditorPaneSplitDropZone
  }> = [
    { distance: Math.max(0, event.clientX - rect.left), zone: 'left' },
    { distance: Math.max(0, rect.right - event.clientX), zone: 'right' },
    { distance: Math.max(0, event.clientY - rect.top), zone: 'top' },
    { distance: Math.max(0, rect.bottom - event.clientY), zone: 'bottom' },
  ]
  distances.sort((left, right) => left.distance - right.distance)

  const closest = distances[0]
  if (!closest || closest.distance > threshold) return null

  return closest.zone
}

function editorPaneRootEdgeThreshold(rect: DOMRect) {
  return Math.min(
    EDITOR_PANE_ROOT_EDGE_MAX_PX,
    Math.max(
      EDITOR_PANE_ROOT_EDGE_MIN_PX,
      Math.min(rect.width, rect.height) * EDITOR_PANE_ROOT_EDGE_FRACTION,
    ),
  )
}

function normalizedPointerOffset(value: number, start: number, size: number) {
  if (size <= 0) return 0.5

  return Math.max(0, Math.min(1, (value - start) / size))
}
