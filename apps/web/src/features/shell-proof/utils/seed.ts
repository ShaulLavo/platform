import {
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
} from '@workspace/tiling/utils/layout-builders'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

export const SHELL_PROOF_ROOT_PATH = '/shell-proof-workspace'

export const FAKE_FILE_PATHS = [
  '/shell-proof-workspace/apps/web/src/app.tsx',
  '/shell-proof-workspace/apps/web/src/features/workbench/components/layout-renderer.tsx',
  '/shell-proof-workspace/apps/web/src/features/workbench/components/rail.tsx',
  '/shell-proof-workspace/apps/web/src/features/workbench/components/tool-pane-header.tsx',
  '/shell-proof-workspace/apps/web/src/features/tiling-surface-manager/engine/surface-state.ts',
  '/shell-proof-workspace/packages/tiling/src/utils/layout-builders.ts',
  '/shell-proof-workspace/packages/tiling/src/utils/recipe-packing.ts',
  '/shell-proof-workspace/packages/tiling/src/utils/rail-model.ts',
  '/shell-proof-workspace/packages/tiling/src/utils/bottom-pane-model.ts',
  '/shell-proof-workspace/packages/tiling/src/utils/drop-target-resolver.ts',
  '/shell-proof-workspace/packages/tiling/src/utils/snap-destinations.ts',
  '/shell-proof-workspace/docs/tiling-surface-manager/default-recipe.md',
] as const

const DEFAULT_EDITOR_PATH = FAKE_FILE_PATHS[0]

export function shellProofInitialLayout(search: string): WorkspaceLayout {
  if (shellProofStartsEmpty(search)) return createEmptyWorkspaceLayout()

  return createClassicFirstRunWorkspaceLayout({
    editorFile: { path: DEFAULT_EDITOR_PATH },
  })
}

export function shellProofSeedKey(search: string) {
  if (shellProofStartsEmpty(search)) return 'empty'

  return 'default'
}

function shellProofStartsEmpty(search: string) {
  return new URLSearchParams(search).has('empty')
}
