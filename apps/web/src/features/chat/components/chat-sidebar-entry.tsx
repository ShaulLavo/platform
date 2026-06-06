import { ActivityTab } from '@/components/workspace/activity-bar/components/activity-tab'
import { ChatsCircleIcon } from '@phosphor-icons/react'

export function ChatSidebarEntry() {
  return <ActivityTab icon={<ChatsCircleIcon className='size-5' />} label='Chat' value='chat' />
}
