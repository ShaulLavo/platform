import { describe, expect, it } from 'vitest'

import { applyLayoutOperation } from '@workspace/tiling'
import {
  CLASSIC_EDITOR_WINDOW_ID,
  CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
  createClassicFirstRunWorkspaceLayout,
} from '@workspace/tiling/utils/layout-builders'
import {
  CLOSE_ACTIVE_SURFACE_COMMAND_ID,
  FOCUS_WINDOW_LEFT_COMMAND_ID,
  LEFT_HALF_ACTIVE_WINDOW_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
} from '@workspace/tiling/utils/layout-command-catalog'
import { layoutOperationForBuiltInWindowManagementCommandId } from '@workspace/tiling/utils/layout-command-operations'
import { checkWorkspaceLayoutInvariants } from '@workspace/tiling/utils/layout-invariants'

describe('layout command operations', () => {
  it('maps split commands to layout operations', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const operation = layoutOperationForBuiltInWindowManagementCommandId(
      layout,
      SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
    )

    expect(operation).toMatchObject({
      edge: 'right',
      surfaceId: layout.activeSurfaceId,
      type: 'splitWindow',
      windowId: CLASSIC_EDITOR_WINDOW_ID,
    })
  })

  it('maps close active surface to a close surface operation', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const operation = layoutOperationForBuiltInWindowManagementCommandId(
      layout,
      CLOSE_ACTIVE_SURFACE_COMMAND_ID,
    )

    expect(operation).toMatchObject({
      surfaceId: layout.activeSurfaceId,
      type: 'closeSurface',
    })
  })

  it('maps focus commands to neighbor activation operations', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const operation = layoutOperationForBuiltInWindowManagementCommandId(
      layout,
      FOCUS_WINDOW_LEFT_COMMAND_ID,
    )

    expect(operation).toMatchObject({
      surfaceId: layout.windowsById[CLASSIC_FILE_NAVIGATOR_WINDOW_ID].activeSurfaceId,
      type: 'activateSurface',
      windowId: CLASSIC_FILE_NAVIGATOR_WINDOW_ID,
    })
  })

  it('routes frame commands through the dispatcher frame operation', () => {
    const layout = createClassicFirstRunWorkspaceLayout()
    const operation = layoutOperationForBuiltInWindowManagementCommandId(
      layout,
      LEFT_HALF_ACTIVE_WINDOW_COMMAND_ID,
    )
    if (!operation) throw new Error('Expected frame command operation')

    const nextLayout = applyLayoutOperation(layout, operation)

    expect(operation.type).toBe('applyCustomWindowCommand')
    expect(nextLayout.activeWindowId).toBe(CLASSIC_EDITOR_WINDOW_ID)
    expectValidLayout(nextLayout)
  })
})

function expectValidLayout(layout: Parameters<typeof checkWorkspaceLayoutInvariants>[0]) {
  const report = checkWorkspaceLayoutInvariants(layout)

  expect(report.violations).toEqual([])
}
