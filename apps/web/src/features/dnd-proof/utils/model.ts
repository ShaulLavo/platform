import {
  packLayoutIntoBalancedColumns,
  windowIdsInReadingOrder,
} from '@workspace/tiling/utils/balanced-columns'
import {
  createEmptyWorkspaceLayout,
  createPlaceholderSurface,
} from '@workspace/tiling/utils/layout-builders'
import { applyLayoutOperation } from '@workspace/tiling'
import {
  activateSurface,
  closeSurface,
  moveSurface,
  openSurface,
  tabSurface,
} from '@workspace/tiling/utils/layout-operations'
import {
  findWindowIdContainingSurface,
  visibleWindowIdsInOrder,
} from '@workspace/tiling/utils/layout-normalize'
import type {
  LayoutEdge,
  LayoutOperation,
  SnapDestination,
  Surface,
  SurfaceId,
  WindowId,
  WorkspaceLayout,
} from '@workspace/tiling/utils/layout-types'
import type { TilingCommitEvent } from '@workspace/tiling/hooks/use-tiling-drag-controller'

import { commitEventLabel, layoutOperationLabel } from '@/features/workbench/utils/event-labels'
import { windowTitle } from '@workspace/tiling/utils/layout-queries'

export type ProofScenario = 2 | 3 | 6 | 10

export type ProofModel = {
  readonly events: readonly string[]
  readonly layout: WorkspaceLayout
  readonly nextSurfaceNumber: number
}

export const PROOF_SCENARIOS = [2, 3, 6, 10] as const

const DEFAULT_SCENARIO: ProofScenario = 3
const PROOF_SURFACE_TITLES = [
  'Editor',
  'Search',
  'Terminal',
  'Diff',
  'Problems',
  'Chat',
  'Logs',
  'Navigator',
  'Review',
  'Preview',
  'Inspector',
  'History',
] as const

export function createInitialProofModel(): ProofModel {
  return createProofScenarioModel(DEFAULT_SCENARIO)
}

export function createProofScenarioModel(windowCount: ProofScenario): ProofModel {
  const result = proofLayoutForWindowCount(windowCount)

  return {
    events: [`scenario: ${windowCount} windows`],
    layout: result.layout,
    nextSurfaceNumber: result.nextSurfaceNumber,
  }
}

export function addProofWindow(model: ProofModel): ProofModel {
  const surface = createProofSurface(model.nextSurfaceNumber)
  const visibleWindowCount = visibleWindowIdsInOrder(model.layout).length
  const openedLayout = openSurface(model.layout, surface)
  const layout =
    visibleWindowCount === 0 ? openedLayout : appendProofWindow(openedLayout, surface.id)

  return logModel(
    {
      ...model,
      layout,
      nextSurfaceNumber: model.nextSurfaceNumber + 1,
    },
    `added window: ${surface.title}`,
  )
}

// New windows join the balanced column grid as the latest arrival: existing
// windows keep their reading-order spots and the grid repacks around them.
function appendProofWindow(layout: WorkspaceLayout, surfaceId: SurfaceId): WorkspaceLayout {
  const movedLayout = moveSurface(layout, surfaceId, rootEdgeDestination('right'))
  const windowId = findWindowIdContainingSurface(movedLayout, surfaceId)
  if (!windowId) return movedLayout

  const existingWindowIds = visibleWindowIdsInOrder(movedLayout).filter((id) => id !== windowId)

  return packLayoutIntoBalancedColumns(movedLayout, [
    ...windowIdsInReadingOrder(movedLayout, existingWindowIds),
    windowId,
  ])
}

export function activateProofSurface(model: ProofModel, surfaceId: SurfaceId): ProofModel {
  return {
    ...model,
    layout: activateSurface(model.layout, surfaceId),
  }
}

export function addProofTab(model: ProofModel, windowId?: WindowId): ProofModel {
  const targetWindowId = windowId ?? model.layout.activeWindowId ?? firstWindowId(model.layout)
  if (!targetWindowId) return addProofWindow(model)

  const surface = createProofSurface(model.nextSurfaceNumber)
  const openedLayout = openSurface(model.layout, surface)
  const layout = tabSurface(openedLayout, surface.id, targetWindowId)

  return logModel(
    {
      ...model,
      layout,
      nextSurfaceNumber: model.nextSurfaceNumber + 1,
    },
    `added tab: ${surface.title}`,
  )
}

export function removeProofSurface(model: ProofModel, surfaceId: SurfaceId): ProofModel {
  const surface = model.layout.surfacesById[surfaceId]
  if (!surface) return model

  return logModel(
    {
      ...model,
      layout: closeSurface(model.layout, surfaceId, { force: true }),
    },
    `closed tab: ${surface.title}`,
  )
}

export function removeProofWindow(model: ProofModel, windowId: WindowId): ProofModel {
  const window = model.layout.windowsById[windowId]
  if (!window) return model

  const layout = window.surfaceIds.reduce(
    (nextLayout, surfaceId) => closeSurface(nextLayout, surfaceId, { force: true }),
    model.layout,
  )

  return logModel({ ...model, layout }, `closed window: ${windowTitle(model.layout, windowId)}`)
}

export function dispatchProofLayoutOperation(
  model: ProofModel,
  operation: LayoutOperation,
): ProofModel {
  const layout = applyLayoutOperation(model.layout, operation)
  if (layout === model.layout) return model

  return logModel({ ...model, layout }, layoutOperationLabel(model.layout, operation))
}

export function commitProofLayout(
  model: ProofModel,
  layout: WorkspaceLayout,
  event: TilingCommitEvent,
): ProofModel {
  if (layout === model.layout) return model

  return logModel({ ...model, layout }, commitEventLabel(model.layout, event))
}

function proofLayoutForWindowCount(windowCount: ProofScenario) {
  let layout = createEmptyWorkspaceLayout()
  let nextSurfaceNumber = 1

  for (let index = 0; index < windowCount; index += 1) {
    const surface = createProofSurface(nextSurfaceNumber)
    layout = openSurface(layout, surface)
    if (index > 0) {
      layout = moveSurface(layout, surface.id, rootEdgeDestination('right'))
    }
    nextSurfaceNumber += 1
  }

  layout = packLayoutIntoBalancedColumns(layout)
  const visibleWindowIds = visibleWindowIdsInOrder(layout)
  const tabsPerWindow = windowCount <= 3 ? 2 : 1
  if (tabsPerWindow === 1) return { layout, nextSurfaceNumber }

  for (const windowId of visibleWindowIds) {
    const surface = createProofSurface(nextSurfaceNumber)
    layout = openSurface(layout, surface)
    layout = tabSurface(layout, surface.id, windowId)
    nextSurfaceNumber += 1
  }

  return { layout, nextSurfaceNumber }
}

function createProofSurface(surfaceNumber: number): Surface {
  const title = PROOF_SURFACE_TITLES[(surfaceNumber - 1) % PROOF_SURFACE_TITLES.length]
  const suffix = Math.ceil(surfaceNumber / PROOF_SURFACE_TITLES.length)
  const displayTitle = suffix === 1 ? title : `${title} ${suffix}`

  return createPlaceholderSurface({
    canCollapse: true,
    canClose: true,
    contextKey: `dnd-proof:${surfaceNumber}`,
    title: displayTitle,
  })
}

function rootEdgeDestination(edge: LayoutEdge): SnapDestination {
  return { edge, kind: 'root-edge' }
}

function firstWindowId(layout: WorkspaceLayout): WindowId | undefined {
  return visibleWindowIdsInOrder(layout)[0]
}

function logModel(model: ProofModel, event: string): ProofModel {
  return {
    ...model,
    events: [event, ...model.events].slice(0, 8),
  }
}
