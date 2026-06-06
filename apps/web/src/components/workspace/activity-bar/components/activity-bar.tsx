import { ActivityButton } from '@/components/workspace/activity-bar/components/activity-button'
import { ActivityTab } from '@/components/workspace/activity-bar/components/activity-tab'
import { useTerminalCollapsed } from '@/components/workspace/terminal/hooks/use-terminal-collapsed'
import { useTerminalToggle } from '@/components/workspace/terminal/hooks/use-terminal-toggle'
import { ChatSidebarEntry } from '@/features/chat/components/chat-sidebar-entry'
import {
  FolderIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
  PulseIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react'
import { memo } from 'react'

export const ActivityBar = memo(() => {
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
        <ActivityTab icon={<FolderIcon className='size-5' />} label='Files' value='files' />
        <ActivityTab
          icon={<MagnifyingGlassIcon className='size-5' />}
          label='Search'
          value='search'
        />
        <ActivityTab icon={<GitBranchIcon className='size-5' />} label='Git' value='git' />
        <ActivityTab icon={<PulseIcon className='size-5' />} label='Logs' value='logs' />
        <ChatSidebarEntry />
        <TerminalActivityButton />
      </div>
    </nav>
  )
})

const TerminalActivityButton = memo(() => {
  const terminalCollapsed = useTerminalCollapsed()
  const toggleTerminal = useTerminalToggle()

  return (
    <ActivityButton
      controls='workspace-terminal'
      expanded={!terminalCollapsed}
      icon={<TerminalWindowIcon className='size-5' />}
      label='Terminal'
      onClick={toggleTerminal}
    />
  )
})
