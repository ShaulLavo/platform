import { WorkspaceActivityTab } from '@/components/workspace/workspace-activity-tab'
import { ChatsCircleIcon } from '@phosphor-icons/react'

export function ChatSidebarEntry() {
  return (
    <WorkspaceActivityTab icon={<ChatsCircleIcon className='size-5' />} label='Chat' value='chat' />
  )
}
