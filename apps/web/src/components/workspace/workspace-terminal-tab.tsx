import { cn } from '@workspace/ui/lib/utils'

import { ChromeTabCloseButton } from './chrome-tab-close-button'
import { ChromeTabSelectButton } from './chrome-tab-select-button'
import { chromeTabRootClassName } from './chrome-tab-style'
import type { WorkspaceTerminalTab as WorkspaceTerminalTabModel } from './workspace-terminal-store'

export function WorkspaceTerminalTab({
  active,
  canClose,
  tab,
  onClose,
  onSelect,
}: {
  active: boolean
  canClose: boolean
  tab: WorkspaceTerminalTabModel
  onClose: (tabId: string) => void
  onSelect: (tabId: string) => void
}) {
  const label = `Terminal ${tab.title}`

  return (
    <div
      className={chromeTabRootClassName({
        active,
        className: 'h-7 min-w-0 shrink-0 text-[11px] leading-none',
      })}
      data-chrome-tab-root=''
    >
      <ChromeTabSelectButton
        aria-selected={active}
        className='flex-none px-2.5 text-[11px]'
        onClick={() => onSelect(tab.id)}
        role='tab'
        title={label}
      >
        <span className='truncate font-mono tabular-nums'>term {tab.title}</span>
      </ChromeTabSelectButton>
      {canClose ? (
        <ChromeTabCloseButton
          aria-label={`Close ${label}`}
          className={cn(
            'mr-1 size-5',
            'opacity-0 group-focus-within/chrome-tab:opacity-100 group-hover/chrome-tab:opacity-100',
          )}
          onClick={(event) => {
            event.stopPropagation()
            onClose(tab.id)
          }}
          title={`Close ${label}`}
        />
      ) : null}
    </div>
  )
}
