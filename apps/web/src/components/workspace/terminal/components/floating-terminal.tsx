import { useTerminalCollapsed } from '@/components/workspace/terminal/hooks/use-terminal-collapsed'
import { useTerminalHeight } from '@/components/workspace/terminal/hooks/use-terminal-height'
import { TerminalPanelStack } from '@/components/workspace/terminal/components/terminal-panel-stack'
import { TerminalTabStrip } from '@/components/workspace/terminal/components/terminal-tab-strip'
import { useTerminalToggle } from '@/components/workspace/terminal/hooks/use-terminal-toggle'
import { XIcon } from '@phosphor-icons/react'
import { memo } from 'react'

export const FloatingTerminal = memo(({ rootPath }: { rootPath: string }) => {
  const collapsed = useTerminalCollapsed()
  const toggleTerminal = useTerminalToggle()
  const { height, onResizePointerDown } = useTerminalHeight(rootPath)

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
        <TerminalTabStrip rootPath={rootPath} />
        <TerminalPanelStack rootPath={rootPath} />
      </div>
    </div>
  )
})
