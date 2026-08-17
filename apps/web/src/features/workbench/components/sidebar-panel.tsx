import {
  ChatCircleIcon,
  FilesIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
  ScrollIcon,
} from '@phosphor-icons/react'
import type { EditorKeymapLayer } from '@singapor/core'
import type { ReactNode } from 'react'

import { useFocus } from '@/features/workspace/providers/focus-state'
import { SearchPane } from '@/features/workspace/components/search-pane'
import { ChatSidePanel } from '@/features/chat/components/chat-side-panel'
import { LogsPanel } from '@/features/logs/components/panel'
import { FileNavigatorPanel } from '@/features/workbench/components/file-navigator-panel'
import { GitChangesPanel } from '@/features/workbench/components/git-changes-panel'
import {
  setWorkbenchSidebarTab,
  type WorkbenchPanels,
  type WorkbenchSidebarTab,
} from '@/features/workbench/utils/panels'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export function SidebarPanel({
  editorKeymapLayers,
  panels,
  rootPath,
  onPanelsChange,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly panels: WorkbenchPanels
  readonly rootPath: string
  readonly onPanelsChange: (panels: WorkbenchPanels) => void
}) {
  const setFocusArea = useFocus((state) => state.setFocusArea)

  function selectTab(tab: WorkbenchSidebarTab) {
    onPanelsChange(setWorkbenchSidebarTab(panels, tab))
    setFocusArea(focusAreaForSidebarTab(tab))
  }

  return (
    <aside className='bg-card backdrop-material border-border flex h-full min-h-0 min-w-0 overflow-hidden border-r'>
      <nav
        aria-label='Sidebar tabs'
        className='border-border flex w-11 shrink-0 flex-col items-center gap-1 border-r p-1'
      >
        {sidebarTabButton({
          active: panels.activeSidebarTab === 'files',
          icon: <FilesIcon className='size-4' />,
          label: 'Files',
          onClick: () => selectTab('files'),
        })}
        {sidebarTabButton({
          active: panels.activeSidebarTab === 'git',
          icon: <GitBranchIcon className='size-4' />,
          label: 'Git',
          onClick: () => selectTab('git'),
        })}
        {sidebarTabButton({
          active: panels.activeSidebarTab === 'search',
          icon: <MagnifyingGlassIcon className='size-4' />,
          label: 'Search',
          onClick: () => selectTab('search'),
        })}
        {sidebarTabButton({
          active: panels.activeSidebarTab === 'logs',
          icon: <ScrollIcon className='size-4' />,
          label: 'Logs',
          onClick: () => selectTab('logs'),
        })}
        {sidebarTabButton({
          active: panels.activeSidebarTab === 'chat',
          icon: <ChatCircleIcon className='size-4' />,
          label: 'Chat',
          onClick: () => selectTab('chat'),
        })}
      </nav>
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        {renderSidebarPanel({
          editorKeymapLayers,
          rootPath,
          tab: panels.activeSidebarTab,
        })}
      </div>
    </aside>
  )
}

function sidebarTabButton({
  active,
  icon,
  label,
  onClick,
}: {
  readonly active: boolean
  readonly icon: ReactNode
  readonly label: string
  readonly onClick: () => void
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'text-muted-foreground hover:text-foreground size-8 rounded-md',
        active && 'bg-accent text-accent-foreground',
      )}
      size='icon-sm'
      title={label}
      type='button'
      variant='ghost'
      onClick={onClick}
    >
      {icon}
    </Button>
  )
}

function renderSidebarPanel({
  editorKeymapLayers,
  rootPath,
  tab,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly rootPath: string
  readonly tab: WorkbenchSidebarTab
}) {
  if (tab === 'chat') return <ChatSidePanel rootPath={rootPath} />
  if (tab === 'git') return <GitChangesPanel rootPath={rootPath} />
  if (tab === 'logs') return <LogsPanel active />
  if (tab === 'search')
    return <SearchPane editorKeymapLayers={editorKeymapLayers} rootPath={rootPath} />

  return <FileNavigatorPanel rootPath={rootPath} />
}

function focusAreaForSidebarTab(tab: WorkbenchSidebarTab) {
  if (tab === 'chat') return 'global'
  if (tab === 'files') return 'file-tree'
  if (tab === 'git') return 'git'
  if (tab === 'logs') return 'logs'

  return 'search'
}
