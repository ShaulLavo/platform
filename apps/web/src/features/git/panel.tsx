import { cn } from '@workspace/ui/lib/utils'
import { memo, useMemo, useState, type ComponentProps, type ReactNode } from 'react'

import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { errorMessage } from '@/lib/file-server'
import { useStatus } from './hooks'
import { StateContext, createGitStore } from './state'
import type { FileStatus } from './types'
import { changeRows } from './utils'
import { ChangeGroup } from './components/change-group'
import { CommitControls } from './components/commit-controls'
import { Header } from './components/header'
import { PanelShell } from './components/panel-shell'

const EMPTY_FILES: readonly FileStatus[] = []

export const Panel = memo(({
  className,
  rootPath,
}: ComponentProps<'section'> & { rootPath: string }) => {
  return (
    <StateProvider>
      <PanelContent className={className} rootPath={rootPath} />
    </StateProvider>
  )
})

function StateProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createGitStore)

  return <StateContext value={store}>{children}</StateContext>
}

function PanelContent({ className, rootPath }: ComponentProps<'section'> & { rootPath: string }) {
  const status = useStatus(rootPath)
  const files = status.data?.files ?? EMPTY_FILES
  const repository = status.data?.repository ?? null
  const rows = useMemo(() => changeRows(files), [files])
  const hasLocalChanges = rows.staged.length > 0 || rows.worktree.length > 0
  const panelOpen = useEditorWorkspaceState((state) => state.gitPanelOpen)
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)

  if (status.isPending) {
    return <PanelShell className={className} label='Loading Git' />
  }
  if (status.isError) {
    return <PanelShell className={className} label={errorMessage(status.error)} tone='error' />
  }
  if (!repository) {
    return <PanelShell className={className} label='No Git repository' />
  }

  return (
    <section
      className={cn('flex h-full min-h-0 flex-col bg-background text-foreground', className)}
      onFocusCapture={() => setFocusArea('git')}
      onPointerDownCapture={() => setFocusArea('git')}
    >
      <Header repository={repository} rootPath={rootPath} />
      {panelOpen ? (
        <>
          <CommitControls
            hasLocalChanges={hasLocalChanges}
            repository={repository}
            rootPath={rootPath}
          />
          <div className='app-scrollbar-thin min-h-0 flex-1 overflow-auto pt-2'>
            <ChangeGroup
              label='Staged Changes'
              rootPath={rootPath}
              rows={rows.staged}
              section='staged'
            />
            <ChangeGroup
              label='Changes'
              rootPath={rootPath}
              rows={rows.worktree}
              section='worktree'
            />
            {!hasLocalChanges && (
              <div className='text-muted-foreground px-7 py-4 text-xs'>Working tree clean</div>
            )}
          </div>
        </>
      ) : (
        <div aria-hidden='true' className='bg-background min-h-0 flex-1' />
      )}
    </section>
  )
}
