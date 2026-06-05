import { createStore, type StoreApi } from 'zustand/vanilla'

import { createEmptyWorkspaceLayout } from './layout-builders'
import { checkWorkspaceLayoutInvariants, type LayoutInvariantReport } from './layout-invariants'
import { normalizeWorkspaceLayout } from './layout-normalize'
import { applyLayoutOperation as applyPureLayoutOperation } from './layout-operations'
import type { LayoutOperation, WorkspaceLayout } from './layout-types'

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
        layout: normalizeAndVerifyWorkspaceLayout(
          applyPureLayoutOperation(state.layout, operation),
          {
            ...options,
            checkInvariants,
          },
        ),
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
  throw new Error(invariantErrorMessage(report))
}

function invariantErrorMessage(report: LayoutInvariantReport) {
  return report.violations.map((violation) => violation.message).join('\n')
}
