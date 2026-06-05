import { useWorkspaceTerminalCollapsed } from '@/components/workspace/terminal/hooks/use-workspace-terminal-collapsed'
import { useWorkspaceTerminalHeight } from '@/components/workspace/terminal/hooks/use-workspace-terminal-height'
import { WorkspaceTerminalPanelStack } from '@/components/workspace/terminal/components/workspace-terminal-panel-stack'
import { WorkspaceTerminalTabStrip } from '@/components/workspace/terminal/components/workspace-terminal-tab-strip'
import { useWorkspaceTerminalToggle } from '@/components/workspace/terminal/hooks/use-workspace-terminal-toggle'
import { XIcon } from '@phosphor-icons/react'
import { memo } from 'react'

export const WorkspaceFloatingTerminal = memo(({ rootPath }: { rootPath: string }) => {
  const collapsed = useWorkspaceTerminalCollapsed()
  const toggleTerminal = useWorkspaceTerminalToggle()
  const { height, onResizePointerDown } = useWorkspaceTerminalHeight(rootPath)

  if (collapsed) return null

  return (
    <div className='pointer-events-none absolute inset-0 z-30 flex flex-col justify-end p-1'>
      <div
        className='border-border pointer-events-auto relative flex min-h-0 min-w-0 flex-col overflow-hidden border'
        style={{
          height,
          background: 'var(--terminal-background)',
          boxShadow: '0 10px 34px -16px oklch(0 0 0 / 0.55), 0 2px 8px -6px oklch(0 0 0 / 0.4)',
        }}
      >
        <div
          aria-label='Resize terminal'
          aria-orientation='horizontal'
          className='group/resize absolute inset-x-0 top-0 z-10 flex h-1 cursor-ns-resize touch-none items-start'
          onPointerDown={onResizePointerDown}
          role='separator'
        >
          <span className='bg-border h-px w-full transition-colors group-hover/resize:bg-[#69b1ff]' />
        </div>
        <button
          aria-label='Close terminal'
          className='text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground absolute top-1.5 right-1.5 z-20 flex size-5 items-center justify-center rounded-md transition-colors'
          onClick={toggleTerminal}
          onPointerDown={(event) => event.stopPropagation()}
          title='Close terminal'
          type='button'
        >
          <XIcon className='size-3.5' />
        </button>
        <WorkspaceTerminalTabStrip rootPath={rootPath} />
        <WorkspaceTerminalPanelStack rootPath={rootPath} />
      </div>
    </div>
  )
})
