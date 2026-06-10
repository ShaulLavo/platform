import { expect, test } from '../../../../test/fixtures'
import {
  tilingInsertionPreview,
  tilingTabStripPreviewItems,
} from '@workspace/tiling/utils/tab-preview'
import { createProofScenarioModel } from '@/features/dnd-proof/utils/model'
import { visibleWindowIdsInOrder } from '@workspace/tiling/utils/layout-normalize'
import type { WindowId } from '@workspace/tiling/utils/layout-types'

test('window-center resolves to a merge preview at the target window end', () => {
  const { layout } = createProofScenarioModel(3)
  const { sourceWindowId, targetWindowId } = windowMergePair(layout)
  const sourceWindow = layout.windowsById[sourceWindowId]
  const targetWindow = layout.windowsById[targetWindowId]

  const preview = tilingInsertionPreview({
    activeDrag: { kind: 'window', windowId: sourceWindowId },
    layout,
    resolvedTarget: {
      mode: 'window',
      target: {
        destination: { kind: 'window-center', windowId: targetWindowId },
        kind: 'snap-destination',
      },
    },
  })

  expect(preview).toEqual({
    insertionIndex: targetWindow?.surfaceIds.length,
    kind: 'window-merge',
    sourceSurfaceIds: sourceWindow?.surfaceIds,
    sourceWindowId,
    targetWindowId,
  })
})

test('window-center resolves to a merge preview at tabIndex', () => {
  const { layout } = createProofScenarioModel(3)
  const { sourceWindowId, targetWindowId } = windowMergePair(layout)

  const preview = tilingInsertionPreview({
    activeDrag: { kind: 'window', windowId: sourceWindowId },
    layout,
    resolvedTarget: {
      mode: 'window',
      target: {
        destination: { kind: 'window-center', tabIndex: 1, windowId: targetWindowId },
        kind: 'snap-destination',
      },
    },
  })

  expect(preview?.insertionIndex).toBe(1)
})

test('window merge preview inserts source ghost tabs into target strip items', () => {
  const { layout } = createProofScenarioModel(3)
  const { sourceWindowId, targetWindowId } = windowMergePair(layout)
  const targetSurfaces = surfacesForWindow(layout, targetWindowId)
  const preview = tilingInsertionPreview({
    activeDrag: { kind: 'window', windowId: sourceWindowId },
    layout,
    resolvedTarget: {
      mode: 'window',
      target: { index: 1, kind: 'tab-strip', windowId: targetWindowId },
    },
  })

  const items = tilingTabStripPreviewItems({
    insertionPreview: preview,
    layout,
    surfaces: targetSurfaces,
    windowId: targetWindowId,
  })

  expect(items.map(previewItemLabel)).toEqual([
    `surface:${targetSurfaces[0]?.id}`,
    ...surfacesForWindow(layout, sourceWindowId).map((surface) => `ghost:${surface.id}`),
    `surface:${targetSurfaces[1]?.id}`,
  ])
})

test('returning a detached tab to its source strip moves it to the insertion index', () => {
  const { layout } = createProofScenarioModel(3)
  const [sourceWindowId] = visibleWindowIdsInOrder(layout)
  const sourceWindow = layout.windowsById[sourceWindowId]
  const sourceSurfaceId = sourceWindow?.surfaceIds[0]
  if (!sourceSurfaceId) throw new Error('Missing source surface')

  const preview = tilingInsertionPreview({
    activeDrag: { kind: 'tab', surfaceId: sourceSurfaceId },
    layout,
    resolvedTarget: {
      mode: 'tab-detached',
      target: { index: 1, kind: 'tab-strip', windowId: sourceWindowId },
    },
  })
  const sourceSurfaces = surfacesForWindow(layout, sourceWindowId)
  const items = tilingTabStripPreviewItems({
    insertionPreview: preview,
    layout,
    surfaces: sourceSurfaces,
    windowId: sourceWindowId,
  })
  const remainingLabels = sourceSurfaces
    .filter((surface) => surface.id !== sourceSurfaceId)
    .map((surface) => `surface:${surface.id}`)

  expect(items.map(previewItemLabel)).toEqual([
    ...remainingLabels.slice(0, 1),
    `surface:${sourceSurfaceId}`,
    ...remainingLabels.slice(1),
  ])
})

function windowMergePair(layout: ReturnType<typeof createProofScenarioModel>['layout']) {
  const [sourceWindowId, targetWindowId] = visibleWindowIdsInOrder(layout)
  if (!sourceWindowId) throw new Error('Missing source window')
  if (!targetWindowId) throw new Error('Missing target window')

  return { sourceWindowId, targetWindowId }
}

function surfacesForWindow(
  layout: ReturnType<typeof createProofScenarioModel>['layout'],
  windowId: WindowId,
) {
  const window = layout.windowsById[windowId]
  if (!window) return []

  return window.surfaceIds.flatMap((surfaceId) => {
    const surface = layout.surfacesById[surfaceId]
    if (!surface) return []

    return [surface]
  })
}

function previewItemLabel(item: ReturnType<typeof tilingTabStripPreviewItems>[number]) {
  if (item.kind === 'surface') return `surface:${item.surface.id}`

  return `ghost:${item.surface.id}`
}
