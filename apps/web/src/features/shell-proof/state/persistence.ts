import {
  restoreWorkspaceLayout,
  serializeWorkspaceLayout,
} from '@/features/tiling-surface-manager/engine/layout-persistence'
import { SHELL_PROOF_ROOT_PATH } from '@/features/shell-proof/utils/seed'
import type { WorkspaceLayoutStoreApi } from '@/features/tiling-surface-manager/engine/surface-state'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

const SHELL_PROOF_LAYOUT_STORAGE_KEY_PREFIX = 'platform.shell-proof.layout.v1'

export function shellProofLayoutStorageKey(seedKey: string) {
  return `${SHELL_PROOF_LAYOUT_STORAGE_KEY_PREFIX}.${seedKey}`
}

export function readShellProofStoredLayout(
  storageKey: string,
  seedLayout: WorkspaceLayout,
): WorkspaceLayout {
  const storedPayload = readStoredPayload(storageKey)
  if (!storedPayload) return seedLayout

  const restored = restoreWorkspaceLayout(storedPayload, {
    fallbackLayout: seedLayout,
    rootPath: SHELL_PROOF_ROOT_PATH,
  })
  if (shouldResetStoredLayout(restored)) {
    resetShellProofStoredLayout(storageKey)
    return seedLayout
  }

  if (restored.status === 'recovered') {
    writeShellProofLayout(storageKey, restored.layout)
  }

  return restored.layout
}

export function persistShellProofLayoutStore(store: WorkspaceLayoutStoreApi, storageKey: string) {
  return store.subscribe((state, previousState) => {
    if (state.layout === previousState.layout) return

    writeShellProofLayout(storageKey, state.layout)
  })
}

export function resetShellProofStoredLayout(storageKey: string) {
  if (!canUseLocalStorage()) return

  try {
    localStorage.removeItem(storageKey)
  } catch {
    // Private-mode storage can throw; shell proof should still run in memory.
  }
}

function readStoredPayload(storageKey: string) {
  if (!canUseLocalStorage()) return null

  try {
    const value = localStorage.getItem(storageKey)
    if (!value) return null

    return JSON.parse(value)
  } catch {
    resetShellProofStoredLayout(storageKey)
    return null
  }
}

function writeShellProofLayout(storageKey: string, layout: WorkspaceLayout) {
  if (!canUseLocalStorage()) return

  try {
    localStorage.setItem(storageKey, JSON.stringify(serializeWorkspaceLayout(layout)))
  } catch {
    resetShellProofStoredLayout(storageKey)
  }
}

function canUseLocalStorage() {
  return typeof localStorage !== 'undefined'
}

function shouldResetStoredLayout(result: ReturnType<typeof restoreWorkspaceLayout>) {
  if (result.status === 'unsupported-version') return true

  return result.warnings.some((warning) => warning.code === 'invalid-shape')
}
