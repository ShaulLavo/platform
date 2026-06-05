import { cn } from '@workspace/ui/lib/utils'

import { ChromeTabCloseButton } from '@/components/workspace/editor-tabs/components/chrome-tab-close-button'
import { ChromeTabSelectButton } from '@/components/workspace/editor-tabs/components/chrome-tab-select-button'
import { chromeTabRootClassName } from '@/components/workspace/editor-tabs/utils/chrome-tab-style'
import { chromeTabTrailingSlotStyle } from '@/components/workspace/editor-tabs/utils/editor-tab-style-utils'
import type { WorkspaceTerminalTab as WorkspaceTerminalTabModel } from '@/components/workspace/terminal/utils/workspace-terminal-store'

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
        <div
          className={cn(
            'relative flex h-full w-0 max-w-0 min-w-0 shrink-0 items-center justify-center overflow-hidden',
            'group-hover/chrome-tab:w-[var(--chrome-tab-trailing-slot-width)] group-hover/chrome-tab:max-w-[var(--chrome-tab-trailing-slot-width)] group-hover/chrome-tab:min-w-[var(--chrome-tab-trailing-slot-width)]',
            'group-focus-within/chrome-tab:w-[var(--chrome-tab-trailing-slot-width)] group-focus-within/chrome-tab:max-w-[var(--chrome-tab-trailing-slot-width)] group-focus-within/chrome-tab:min-w-[var(--chrome-tab-trailing-slot-width)]',
            active &&
              'w-[var(--chrome-tab-trailing-slot-width)] max-w-[var(--chrome-tab-trailing-slot-width)] min-w-[var(--chrome-tab-trailing-slot-width)]',
          )}
          style={chromeTabTrailingSlotStyle()}
        >
          <ChromeTabCloseButton
            aria-label={`Close ${label}`}
            className={cn(
              'size-5',
              active
                ? 'opacity-100'
                : 'pointer-events-none opacity-0 group-focus-within/chrome-tab:pointer-events-auto group-focus-within/chrome-tab:opacity-100 group-hover/chrome-tab:pointer-events-auto group-hover/chrome-tab:opacity-100',
            )}
            onClick={(event) => {
              event.stopPropagation()
              onClose(tab.id)
            }}
            title={`Close ${label}`}
          />
        </div>
      ) : null}
    </div>
  )
}
