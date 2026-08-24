import { EmptyState } from '@workspace/ui/components/empty-state'
import { cn } from '@workspace/ui/lib/utils'
import { memo, useMemo, type ComponentProps } from 'react'
import { useIsFetching } from '@tanstack/react-query'

import { useEditorWorkspaceState } from '@/features/editor/state/workspace-state'
import { useFocus } from '@/features/workspace/providers/focus-state'
import { errorMessage } from '@/lib/file-server'
import { useStatus } from '@/features/git/hooks'
import { useGitState } from '@/features/git/state/store'
import type { FileStatus } from '@/features/git/utils/types'
import { changeRows } from '@/features/git/utils/change-rows'
import { ChangeGroup } from '@/features/git/components/change-group'
import { CommitControls } from '@/features/git/components/commit-controls'
import { Header } from '@/features/git/components/header'
import { PanelLoading } from '@/features/git/components/panel-loading'
import { parseDiffDocumentId } from '@/features/git/utils/diff-document'
import { diffDocumentQueryKey } from '@/features/git/utils/diff-document-query'
import { queryHasNoData } from '@/lib/query-state'

const DISABLED_DIFF_QUERY = ['git', 'diffs', 'disabled'] as const

const EMPTY_FILES: readonly FileStatus[] = []

export const Panel = memo(
  ({ className, rootPath }: ComponentProps<'section'> & { rootPath: string }) => {
    return <PanelContent className={className} rootPath={rootPath} />
  },
)

function PanelContent({ className, rootPath }: ComponentProps<'section'> & { rootPath: string }) {
  const status = useStatus(rootPath)
  const files = status.data?.files ?? EMPTY_FILES
  const repository = status.data?.repository ?? null
  const rows = useMemo(() => changeRows(files), [files])
  const hasLocalChanges = rows.staged.length > 0 || rows.worktree.length > 0
  const panelOpen = useGitState((state) => state.panelOpen)
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const selectedDocumentPath = useEditorWorkspaceState((state) => state.selectedFilePath)
  const selectedDiff = parseDiffDocumentId(selectedDocumentPath)
  const selectedDiffQueryKey = selectedDiff
    ? diffDocumentQueryKey(selectedDiff)
    : DISABLED_DIFF_QUERY
  const selectedDiffPending =
    useIsFetching({
      exact: true,
      predicate: queryHasNoData,
      queryKey: selectedDiffQueryKey,
    }) > 0
  const loadingDiff = selectedDiffPending && selectedDiff?.kind === 'snapshot' ? selectedDiff : null

  if (status.isPending) {
    return <PanelLoading className={className} />
  }
  if (status.isError) {
    return (
      <EmptyState
        align='start'
        className={className}
        description={errorMessage(status.error)}
        title='Git is unavailable'
        tone='error'
      />
    )
  }
  if (!repository) {
    return <EmptyState align='start' className={className} title='No Git repository' />
  }

  return (
    <section
      className={cn('flex h-full min-h-0 flex-col text-foreground', className)}
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
              loadingPath={loadingDiff?.source === 'staged' ? loadingDiff.path : null}
              rootPath={rootPath}
              rows={rows.staged}
              section='staged'
            />
            <ChangeGroup
              label='Changes'
              loadingPath={loadingDiff?.source === 'worktree' ? loadingDiff.path : null}
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
        <div aria-hidden='true' className='min-h-0 flex-1' />
      )}
    </section>
  )
}
