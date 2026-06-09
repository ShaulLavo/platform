import { createClientInvariantError } from '@/lib/structured-errors'

import { createStore, type StoreApi } from 'zustand/vanilla'

import { createEmptyWorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-builders'
import {
  checkWorkspaceLayoutInvariants,
  type LayoutInvariantReport,
} from '@/features/tiling-surface-manager/engine/layout-invariants'
import { normalizeWorkspaceLayout } from '@/features/tiling-surface-manager/engine/layout-normalize'
import { applyLayoutOperation as applyPureLayoutOperation } from '@/features/tiling-surface-manager/engine/layout-operations'
import {
  layoutSnapshot,
  logWorkbenchLayoutInfo,
  logWorkbenchLayoutWarn,
  operationSummary,
  visibleLayoutChanged,
} from '@/features/tiling-surface-manager/engine/layout-logging'
import type {
  LayoutOperation,
  WorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-types'

export type WorkspaceLayoutStoreState = {
  readonly layout: WorkspaceLayout
}

export type WorkspaceLayoutStoreActions = {
  readonly dispatchLayoutOperation: (operation: LayoutOperation) => void
  readonly replaceLayout: (layout: WorkspaceLayout) => void
  readonly resetLayout: (layout?: WorkspaceLayout) => void
}

export type WorkspaceLayoutStore = WorkspaceLayoutStoreState & WorkspaceLayoutStoreActions

export type WorkspaceLayoutStoreApi = StoreApi<WorkspaceLayoutStore>

export type CreateWorkspaceLayoutStoreOptions = {
  readonly checkInvariants?: boolean
  readonly onInvariantViolation?: (report: LayoutInvariantReport, layout: WorkspaceLayout) => void
}

export function createWorkspaceLayoutStore(
  initialLayout: WorkspaceLayout = createEmptyWorkspaceLayout(),
  options: CreateWorkspaceLayoutStoreOptions = {},
): WorkspaceLayoutStoreApi {
  const checkInvariants = options.checkInvariants ?? Boolean(import.meta.env?.DEV)
  const initialVerifiedLayout = normalizeAndVerifyWorkspaceLayout(initialLayout, {
    ...options,
    checkInvariants,
  })

  return createStore<WorkspaceLayoutStore>()((set) => ({
    layout: initialVerifiedLayout,
    dispatchLayoutOperation: (operation) =>
      set((state) => ({
        layout: dispatchVerifiedLayoutOperation(state.layout, operation, {
          ...options,
          checkInvariants,
        }),
      })),
    replaceLayout: (layout) =>
      set({
        layout: normalizeAndVerifyWorkspaceLayout(layout, {
          ...options,
          checkInvariants,
        }),
      }),
    resetLayout: (layout = createEmptyWorkspaceLayout()) =>
      set({
        layout: normalizeAndVerifyWorkspaceLayout(layout, {
          ...options,
          checkInvariants,
        }),
      }),
  }))
}

function dispatchVerifiedLayoutOperation(
  layout: WorkspaceLayout,
  operation: LayoutOperation,
  options: Required<Pick<CreateWorkspaceLayoutStoreOptions, 'checkInvariants'>> &
    CreateWorkspaceLayoutStoreOptions,
) {
  const before = layoutSnapshot(layout)
  const operationContext = operationSummary(operation)

  try {
    const nextLayout = normalizeAndVerifyWorkspaceLayout(
      applyPureLayoutOperation(layout, operation),
      options,
    )
    logWorkbenchLayoutInfo('layout.operation.dispatch', {
      activeSurfaceChanged: layout.activeSurfaceId !== nextLayout.activeSurfaceId,
      activeWindowChanged: layout.activeWindowId !== nextLayout.activeWindowId,
      before,
      changed: visibleLayoutChanged(layout, nextLayout),
      operation: operationContext,
      outcome: 'ok',
      result: layoutSnapshot(nextLayout),
      stateChanged: nextLayout !== layout,
    })
    return nextLayout
  } catch (error) {
    logWorkbenchLayoutWarn('layout.operation.dispatch', {
      before,
      error,
      operation: operationContext,
      outcome: 'error',
    })
    throw error
  }
}

function normalizeAndVerifyWorkspaceLayout(
  layout: WorkspaceLayout,
  options: Required<Pick<CreateWorkspaceLayoutStoreOptions, 'checkInvariants'>> &
    CreateWorkspaceLayoutStoreOptions,
) {
  const normalizedLayout = normalizeWorkspaceLayout(layout)
  if (!options.checkInvariants) return normalizedLayout

  const report = checkWorkspaceLayoutInvariants(normalizedLayout)
  if (report.ok) return normalizedLayout

  options.onInvariantViolation?.(report, normalizedLayout)
  throw createClientInvariantError(invariantErrorMessage(report))
}

function invariantErrorMessage(report: LayoutInvariantReport) {
  return report.violations.map((violation) => violation.message).join('\n')
}
