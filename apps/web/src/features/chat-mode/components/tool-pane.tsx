import type { EditorKeymapLayer } from '@singapor/core'
import { Button } from '@workspace/ui/components/button'
import { LoadingState } from '@workspace/ui/components/loading-state'

import { SearchPane } from '@/features/workspace/components/search-pane'
import type { EditorTabConflictMap } from '@/features/workspace/utils/tab-types'
import { ChatDiffStatLabel } from '@/features/chat/components/chat-diff-stat-label'
import { useSessionTerminalId } from '@/features/chat-mode/hooks/use-session-terminal-id'
import { useSessionToolRoot } from '@/features/chat-mode/hooks/use-session-tool-root'
import { useThreadDiffScope } from '@/features/chat/hooks/use-thread-diff-scope'
import { Panel as GitPanel } from '@/features/git/components/panel'
import type { FileStatus } from '@/features/git/utils/types'
import { LogsPanel } from '@/features/logs/components/panel'
import { TerminalPanel } from '@/features/terminal/components/panel'
import { CodePanel } from '@/features/workbench/components/code-panel'
import { DiagnosticsPanel } from '@/features/workbench/components/diagnostics-panel'
import { FileNavigatorPanel } from '@/features/workbench/components/file-navigator-panel'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'
import type { WorkbenchPanels } from '@/features/workbench/utils/panels'
import type { ChatModeToolTab } from '@/features/chat-mode/utils/panels'

type ThreadDiffScopeState = ReturnType<typeof useThreadDiffScope>

export function ToolPane({
  conflicts,
  editorKeymapLayers,
  gitFiles,
  rootPath,
  tab,
  workbenchPanels,
}: {
  readonly conflicts: EditorTabConflictMap
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly gitFiles: readonly FileStatus[]
  /** The project root. Individual tools act on the session's checkout below. */
  readonly rootPath: string
  readonly tab: ChatModeToolTab
  readonly workbenchPanels: WorkbenchPanels
}) {
  // Read for every tab, not just the git one: the hook is what moves a pick off a
  // turn a revert deleted, and it can only do that while it is mounted. Tying it
  // to the git tab would leave a dangling turn in storage until the tab is opened.
  const diffScope = useThreadDiffScope()
  // These are *this session's* tools, so every one of them follows the session's
  // checkout rather than the project root. Same value for a session with no
  // worktree; the difference only appears once one has its own.
  const toolRoot = useSessionToolRoot()
  const terminalSessionId = useSessionTerminalId()

  if (tab === 'editor') {
    return (
      <CodePanel
        conflicts={conflicts}
        editorKeymapLayers={editorKeymapLayers}
        gitFiles={gitFiles}
        panels={workbenchPanels}
        rootPath={rootPath}
      />
    )
  }
  if (tab === 'files') return <FileNavigatorPanel rootPath={toolRoot} />
  if (tab === 'git') return gitToolPane(toolRoot, diffScope)
  if (tab === 'logs') {
    return (
      <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
        <ToolPaneHeader tab='logs' />
        <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
          <LogsPanel active />
        </div>
      </section>
    )
  }
  if (tab === 'problems') {
    return (
      <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
        <ToolPaneHeader tab='problems' />
        <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
          <DiagnosticsPanel />
        </div>
      </section>
    )
  }
  if (tab === 'search') {
    return <SearchPane editorKeymapLayers={editorKeymapLayers} rootPath={toolRoot} />
  }

  return (
    <section className='bg-content-well flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader tab='terminal' />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <TerminalPanel
          active
          className='h-full'
          rootPath={toolRoot}
          sessionId={terminalSessionId}
        />
      </div>
    </section>
  )
}

/**
 * Mounts the header itself rather than reusing `GitChangesPanel`, which carries
 * its own: the scope bar has to sit between the header and the panel body, and
 * that panel belongs to the workbench sidebar too.
 */
function gitToolPane(rootPath: string, diffScope: ThreadDiffScopeState) {
  const { latestTurnId, scope, selectTurnScope, selectWorkingTreeScope } = diffScope

  return (
    <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader tab='git' />
      <div
        aria-label='Diff scope'
        className='border-border flex shrink-0 items-center gap-1 border-b px-2 py-1'
        role='group'
      >
        {scopeButton({
          active: scope.kind === 'working-tree',
          label: 'Working tree',
          onSelect: selectWorkingTreeScope,
        })}
        {scopeButton({
          active: scope.kind === 'turn',
          // A thread that has not produced a checkpoint has no turn to show, and
          // an inert button is worse than one that says so.
          disabled: !latestTurnId,
          label: 'Turn',
          onSelect: () => {
            if (!latestTurnId) return

            selectTurnScope(latestTurnId)
          },
        })}
      </div>
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        {scope.kind === 'turn' ? turnScopeBody(diffScope) : <GitPanel rootPath={rootPath} />}
      </div>
    </section>
  )
}

function scopeButton({
  active,
  disabled = false,
  label,
  onSelect,
}: {
  readonly active: boolean
  readonly disabled?: boolean
  readonly label: string
  readonly onSelect: () => void
}) {
  return (
    <Button
      aria-pressed={active}
      disabled={disabled}
      size='xs'
      type='button'
      variant={active ? 'secondary' : 'ghost'}
      onClick={onSelect}
    >
      {label}
    </Button>
  )
}

function turnScopeBody({ openTurnFile, turnSummary }: ThreadDiffScopeState) {
  // No summary yet means the checkpoint has not streamed in — pending, not
  // absent. 'missing' below is the state that means there is nothing to show.
  if (!turnSummary) {
    return <LoadingState className='px-3 py-2' label='Loading checkpoint' rows={3} />
  }
  if (turnSummary.status !== 'ready' || turnSummary.files.length === 0) {
    return (
      <p className='text-muted-foreground px-3 py-2 text-[11px]'>
        No checkpoint diff for turn {turnSummary.checkpointTurnCount}.
      </p>
    )
  }

  return (
    <div className='app-scrollbar-thin h-full min-h-0 overflow-auto py-1'>
      <p className='text-muted-foreground px-3 pb-1 text-[11px] tabular-nums'>
        Turn {turnSummary.checkpointTurnCount} · {turnSummary.files.length} files
      </p>
      {turnSummary.files.map((file) => (
        <Button
          className='w-full justify-between gap-2 px-3 font-normal'
          key={file.path}
          size='sm'
          type='button'
          variant='ghost'
          onClick={() => openTurnFile(file.path)}
        >
          <span className='min-w-0 truncate text-left'>{file.path}</span>
          <ChatDiffStatLabel additions={file.additions} deletions={file.deletions} />
        </Button>
      ))}
    </div>
  )
}
