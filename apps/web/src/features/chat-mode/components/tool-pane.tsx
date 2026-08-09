import type { EditorKeymapLayer } from '@singapor/core'

import { SearchPane } from '@/components/workspace/search/components/search-pane'
import type { EditorTabConflictMap } from '@/components/workspace/editor-tabs/utils/editor-tab-types'
import type { FileStatus } from '@/features/git/types'
import { LogsPanel } from '@/features/logs/panel'
import { TerminalPanel } from '@/features/terminal/terminal-panel'
import { CodePanel } from '@/features/workbench/components/code-panel'
import { DiagnosticsPanel } from '@/features/workbench/components/diagnostics-panel'
import { FileNavigatorPanel } from '@/features/workbench/components/file-navigator-panel'
import { GitChangesPanel } from '@/features/workbench/components/git-changes-panel'
import { ToolPaneHeader } from '@/features/workbench/components/tool-pane-header'
import type { WorkbenchPanels } from '@/features/workbench/utils/workbench-panels'
import type { ChatModeToolTab } from '@/features/chat-mode/utils/panels'

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
  readonly rootPath: string
  readonly tab: ChatModeToolTab
  readonly workbenchPanels: WorkbenchPanels
}) {
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
  if (tab === 'files') return <FileNavigatorPanel rootPath={rootPath} />
  if (tab === 'git') return <GitChangesPanel rootPath={rootPath} />
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
    return <SearchPane editorKeymapLayers={editorKeymapLayers} rootPath={rootPath} />
  }

  return (
    <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <ToolPaneHeader tab='terminal' />
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        <TerminalPanel active className='h-full' rootPath={rootPath} sessionId='terminal-1' />
      </div>
    </section>
  )
}
