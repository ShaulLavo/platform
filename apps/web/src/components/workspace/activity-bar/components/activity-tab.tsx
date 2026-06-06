import type { WorkspacePanelTab } from '@/lib/workspace-cache'
import {
  activityButtonId,
  sidebarPanelId,
} from '@/components/workspace/shell/utils/workspace-view-utils'
import { useEditorWorkspaceState } from '@/features/editor/state/editor-workspace-state'
import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import type { ReactNode } from 'react'

export function ActivityTab({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: WorkspacePanelTab
}) {
  const active = useEditorWorkspaceState(
    (state) => state.sidebarVisible && state.workspacePanelTab === value,
  )
  const activateWorkspacePanelTab = useEditorWorkspaceState(
    (state) => state.activateWorkspacePanelTab,
  )

  function handleClick() {
    activateWorkspacePanelTab(value)
  }

  return (
    <Button
      id={activityButtonId(value)}
      aria-controls={sidebarPanelId(value)}
      aria-expanded={active}
      aria-label={label}
      className={cn(
        'size-8 flex-none rounded-md p-0 text-muted-foreground hover:bg-muted/50',
        'aria-expanded:bg-accent aria-expanded:text-accent-foreground aria-expanded:hover:bg-accent aria-expanded:hover:text-accent-foreground',
      )}
      size='icon'
      title={label}
      type='button'
      variant='ghost'
      onClick={handleClick}
    >
      {icon}
      <span className='sr-only'>{label}</span>
    </Button>
  )
}
