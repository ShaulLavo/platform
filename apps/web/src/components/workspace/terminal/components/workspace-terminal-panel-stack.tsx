import { TerminalPanel } from '@/features/terminal/terminal-panel'
import { cn } from '@workspace/ui/lib/utils'

import { useWorkspaceTerminalState } from '@/components/workspace/terminal/hooks/use-workspace-terminal-state'

export function WorkspaceTerminalPanelStack({ rootPath }: { rootPath: string }) {
  const activeTerminalTabId = useWorkspaceTerminalState((state) => state.activeTerminalTabId)
  const terminalTabs = useWorkspaceTerminalState((state) => state.terminalTabs)

  return (
    <div className='relative min-h-0 min-w-0 flex-1 overflow-hidden'>
      {terminalTabs.map((tab) => {
        const active = tab.id === activeTerminalTabId

        return (
          <TerminalPanel
            active={active}
            aria-hidden={!active}
            aria-label={`Terminal ${tab.title}`}
            className={cn(
              'absolute inset-0',
              active ? 'visible z-10' : 'invisible z-0 pointer-events-none',
            )}
            key={tab.id}
            rootPath={rootPath}
            sessionId={tab.id}
          />
        )
      })}
    </div>
  )
}
