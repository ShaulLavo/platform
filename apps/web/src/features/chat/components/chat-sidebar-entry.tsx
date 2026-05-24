import { WorkspaceActivityTab } from '@/components/workspace/workspace-activity-tab'
import type { WorkspacePanelTab } from '@/lib/workspace-cache'
import { ChatsCircleIcon } from '@phosphor-icons/react'

export function ChatSidebarEntry({
  currentVisible,
  onSelectTab,
}: {
  currentVisible: boolean
  onSelectTab: (tab: WorkspacePanelTab) => void
}) {
  return (
    <WorkspaceActivityTab
      currentVisible={currentVisible}
      icon={<ChatsCircleIcon className='size-5' />}
      label='Chat'
      value='chat'
      onSelectTab={onSelectTab}
    />
  )
}
