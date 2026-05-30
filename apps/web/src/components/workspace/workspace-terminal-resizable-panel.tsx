import { useWorkspaceTerminalCollapsed } from '@/components/workspace/use-workspace-terminal-collapsed'
import { useWorkspaceTerminalPanelRef } from '@/components/workspace/use-workspace-terminal-panel-ref'
import { useWorkspaceTerminalResizeHandler } from '@/components/workspace/use-workspace-terminal-resize-handler'
import { TerminalPanel } from '@/features/terminal/terminal-panel'
import { ResizablePanel } from '@workspace/ui/components/resizable'
import { memo } from 'react'

export const WorkspaceTerminalResizablePanel = memo(({
  rootPath,
}: {
  rootPath: string
}) => {
  const handleTerminalResize = useWorkspaceTerminalResizeHandler()
  const terminalPanelRef = useWorkspaceTerminalPanelRef()

  return (
    <ResizablePanel
      id='workspace-terminal'
      className='min-h-0 min-w-0 overflow-hidden'
      collapsible
      collapsedSize='0px'
      defaultSize='30%'
      minSize='160px'
      maxSize='65%'
      groupResizeBehavior='preserve-pixel-size'
      panelRef={terminalPanelRef}
      onResize={handleTerminalResize}
    >
      <WorkspaceTerminalPanelVisibility rootPath={rootPath} />
    </ResizablePanel>
  )
})

const WorkspaceTerminalPanelVisibility = memo(({
  rootPath,
}: {
  rootPath: string
}) => {
  const terminalCollapsed = useWorkspaceTerminalCollapsed()

  return (
    <TerminalPanel aria-hidden={terminalCollapsed} inert={terminalCollapsed} rootPath={rootPath} />
  )
})
