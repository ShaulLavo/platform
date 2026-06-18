import { FilesIcon, GitBranchIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import type { EditorKeymapLayer } from '@singapor/core'
import type { ReactNode } from 'react'

import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { SearchPane } from '@/components/workspace/search/components/search-pane'
import type { GitStoreApi } from '@/features/git/state'
import { FileNavigatorPanel } from '@/features/workbench/components/file-navigator-panel'
import { GitChangesPanel } from '@/features/workbench/components/git-changes-panel'
import {
  setWorkbenchSidebarTab,
  type WorkbenchPanels,
  type WorkbenchSidebarTab,
} from '@/features/workbench/utils/workbench-panels'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

export function SidebarPanel({
  editorKeymapLayers,
  gitStore,
  panels,
  rootPath,
  onPanelsChange,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly gitStore: GitStoreApi
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
    <aside className='bg-card border-border flex h-full min-h-0 min-w-0 overflow-hidden border-r'>
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
      </nav>
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
        {renderSidebarPanel({
          editorKeymapLayers,
          gitStore,
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
  gitStore,
  rootPath,
  tab,
}: {
  readonly editorKeymapLayers: readonly EditorKeymapLayer[]
  readonly gitStore: GitStoreApi
  readonly rootPath: string
  readonly tab: WorkbenchSidebarTab
}) {
  if (tab === 'git') return <GitChangesPanel rootPath={rootPath} store={gitStore} />
  if (tab === 'search')
    return <SearchPane editorKeymapLayers={editorKeymapLayers} rootPath={rootPath} />

  return <FileNavigatorPanel rootPath={rootPath} />
}

function focusAreaForSidebarTab(tab: WorkbenchSidebarTab) {
  if (tab === 'files') return 'file-tree'
  if (tab === 'git') return 'git'

  return 'search'
}
