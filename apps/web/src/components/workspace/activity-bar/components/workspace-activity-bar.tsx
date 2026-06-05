import { WorkspaceActivityButton } from '@/components/workspace/activity-bar/components/workspace-activity-button'
import { WorkspaceActivityTab } from '@/components/workspace/activity-bar/components/workspace-activity-tab'
import { useWorkspaceTerminalCollapsed } from '@/components/workspace/terminal/hooks/use-workspace-terminal-collapsed'
import { useWorkspaceTerminalToggle } from '@/components/workspace/terminal/hooks/use-workspace-terminal-toggle'
import { ChatSidebarEntry } from '@/features/chat/components/chat-sidebar-entry'
import {
  FolderIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
  PulseIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react'
import { memo } from 'react'

export const WorkspaceActivityBar = memo(() => {
  return (
    <nav
      aria-label='Workspace activity'
      className='border-border bg-background flex h-full w-10 flex-col items-stretch gap-1 border-r px-1 py-2'
    >
      <div
        role='group'
        aria-label='Workspace panels'
        className='flex h-auto w-full flex-col items-stretch justify-start gap-1 border-0 bg-transparent p-0'
      >
        <WorkspaceActivityTab
          icon={<FolderIcon className='size-5' />}
          label='Files'
          value='files'
        />
        <WorkspaceActivityTab
          icon={<MagnifyingGlassIcon className='size-5' />}
          label='Search'
          value='search'
        />
        <WorkspaceActivityTab icon={<GitBranchIcon className='size-5' />} label='Git' value='git' />
        <WorkspaceActivityTab icon={<PulseIcon className='size-5' />} label='Logs' value='logs' />
        <ChatSidebarEntry />
        <WorkspaceTerminalActivityButton />
      </div>
    </nav>
  )
})

const WorkspaceTerminalActivityButton = memo(() => {
  const terminalCollapsed = useWorkspaceTerminalCollapsed()
  const toggleTerminal = useWorkspaceTerminalToggle()

  return (
    <WorkspaceActivityButton
      controls='workspace-terminal'
      expanded={!terminalCollapsed}
      icon={<TerminalWindowIcon className='size-5' />}
      label='Terminal'
      onClick={toggleTerminal}
    />
  )
})
