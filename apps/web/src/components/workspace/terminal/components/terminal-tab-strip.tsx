import { PlusIcon } from '@phosphor-icons/react'

import { disposeTerminalSession } from '@/features/terminal/dispose-terminal-session'

import { useTerminalState } from '@/components/workspace/terminal/hooks/use-terminal-state'
import { TerminalTab } from '@/components/workspace/terminal/components/terminal-tab'

export function TerminalTabStrip({ rootPath }: { rootPath: string }) {
  const activeTerminalTabId = useTerminalState((state) => state.activeTerminalTabId)
  const closeTerminalTab = useTerminalState((state) => state.closeTerminalTab)
  const createTerminalTab = useTerminalState((state) => state.createTerminalTab)
  const setActiveTerminalTabId = useTerminalState((state) => state.setActiveTerminalTabId)
  const terminalTabs = useTerminalState((state) => state.terminalTabs)
  const canClose = terminalTabs.length > 1

  return (
    <div
      className='border-border/70 flex h-7 shrink-0 items-stretch border-b pr-8 pl-1'
      style={{ background: 'var(--background)' }}
    >
      <div
        aria-label='Terminal tabs'
        className='flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden'
        role='tablist'
      >
        {terminalTabs.map((tab) => (
          <TerminalTab
            active={tab.id === activeTerminalTabId}
            canClose={canClose}
            key={tab.id}
            tab={tab}
            onClose={(tabId) => {
              disposeTerminalSession(rootPath, tabId)
              closeTerminalTab(tabId)
            }}
            onSelect={setActiveTerminalTabId}
          />
        ))}
      </div>
      <button
        aria-label='New terminal tab'
        className='text-muted-foreground hover:bg-muted/55 hover:text-foreground focus-visible:ring-ring/50 my-1 ml-1 flex size-5 shrink-0 items-center justify-center rounded-[5px] transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] outline-none focus-visible:ring-1 active:scale-[0.97]'
        onClick={createTerminalTab}
        title='New terminal tab'
        type='button'
      >
        <PlusIcon className='size-3.5' />
      </button>
    </div>
  )
}
