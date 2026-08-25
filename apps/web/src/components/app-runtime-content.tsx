import type { ReactNode } from 'react'

import { AppTitlebar } from '@/components/app-titlebar'
import { AppWorkspace } from '@/components/app-workspace'
import { useDirtyTabCloseRequest } from '@/features/editor/hooks/use-dirty-tab-close'
import { EditorTabActionsProvider } from '@/features/editor/providers/tab-actions-provider'
import { useRestoreRecentWorkspaceRoot } from '@/features/workspace/hooks/use-restore-recent-root'
import { useUnsavedWorkGuard } from '@/features/workspace/hooks/use-unsaved-work-guard'
import { useAddressProjection } from '@/features/address/hooks/use-projection'
import { useAddressRestore } from '@/features/address/hooks/use-restore'
import { useWorkspaceCachePersistence } from '@/features/workspace/hooks/use-cache-persistence'
import { useAutoSave } from '@/features/editor/hooks/use-auto-save'
import { CommandProvider } from '@/keymap/providers/command-provider'
import { useFocusTarget } from '@/lib/focus/hooks/use-target'

export function AppRuntimeContent() {
  const { dirtyTabCloseDialog, requestCloseTab, requestCloseTabs } = useDirtyTabCloseRequest()

  // Subscribe before recovery so a recovered root recreates its erased cache entry.
  useWorkspaceCachePersistence()
  // Restore before projecting, so the applier's writes are what the first projection
  // sees rather than racing it.
  useAddressRestore()
  useAddressProjection()
  // Mounted beside the cache persistence: both need the document store, and both
  // are app-lifetime concerns rather than anything a pane owns.
  useAutoSave()
  useRestoreRecentWorkspaceRoot()
  useUnsavedWorkGuard()

  return (
    <EditorTabActionsProvider requestCloseTab={requestCloseTab} requestCloseTabs={requestCloseTabs}>
      <CommandProvider>
        <AppShell dirtyTabCloseDialog={dirtyTabCloseDialog} />
      </CommandProvider>
    </EditorTabActionsProvider>
  )
}

function AppShell({ dirtyTabCloseDialog }: { readonly dirtyTabCloseDialog: ReactNode }) {
  const { ref: shellRef } = useFocusTarget<HTMLDivElement>({
    area: 'global',
    id: { kind: 'app-shell' },
    onIntent: (intent, element) => {
      if (intent !== 'focus') return false

      element.focus()
      return true
    },
  })

  return (
    <div
      className='bg-background text-foreground flex h-svh flex-col overflow-hidden'
      ref={shellRef}
      tabIndex={-1}
    >
      <AppTitlebar />
      <main className='min-h-0 flex-1'>
        <AppWorkspace />
      </main>
      {dirtyTabCloseDialog}
    </div>
  )
}
