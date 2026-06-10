import { useEffect, useState } from 'react'

import { ShellProofLayout } from '@/features/shell-proof/components/layout'
import {
  persistShellProofLayoutStore,
  readShellProofStoredLayout,
  shellProofLayoutStorageKey,
} from '@/features/shell-proof/state/persistence'
import { createShellProofLayoutStore } from '@/features/shell-proof/state/store'
import { shellProofInitialLayout, shellProofSeedKey } from '@/features/shell-proof/utils/seed'
import { LayoutProvider } from '@/features/workbench/providers/layout-provider'
import type { WorkspaceLayoutStoreApi } from '@/features/tiling-surface-manager/engine/surface-state'
import type { WorkspaceLayout } from '@workspace/tiling/utils/layout-types'

type ShellProofSessionState = {
  readonly seedLayout: WorkspaceLayout
  readonly storageKey: string
  readonly store: WorkspaceLayoutStoreApi
}

export function ShellProofSession({ search }: { readonly search: string }) {
  const [session] = useState(() => createShellProofSessionState(search))

  useEffect(
    () => persistShellProofLayoutStore(session.store, session.storageKey),
    [session.storageKey, session.store],
  )

  return (
    <LayoutProvider store={session.store}>
      <ShellProofLayout seedLayout={session.seedLayout} />
    </LayoutProvider>
  )
}

function createShellProofSessionState(search: string): ShellProofSessionState {
  const seedLayout = shellProofInitialLayout(search)
  const storageKey = shellProofLayoutStorageKey(shellProofSeedKey(search))
  const restoredLayout = readShellProofStoredLayout(storageKey, seedLayout)

  return {
    seedLayout,
    storageKey,
    store: createShellProofLayoutStore(restoredLayout),
  }
}
