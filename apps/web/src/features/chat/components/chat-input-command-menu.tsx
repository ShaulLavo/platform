import { cn } from '@workspace/ui/lib/utils'
import { useLayoutEffect, useMemo, useRef } from 'react'

import {
  chatInputCommandMenuLoadingLabel,
  groupChatInputCommandItems,
  type ChatInputCommandItem,
  type ChatInputTriggerKind,
} from '../lib/chat-input-logic'
import { ChatInputCommandItemIcon } from './chat-input-command-item-icon'

export function ChatInputCommandMenu({
  activeItemId,
  emptyLabel,
  isLoading,
  items,
  triggerKind,
  onActiveItemChange,
  onSelect,
}: {
  activeItemId: string | null
  emptyLabel: string
  isLoading: boolean
  items: readonly ChatInputCommandItem[]
  triggerKind: ChatInputTriggerKind
  onActiveItemChange: (itemId: string | null) => void
  onSelect: (item: ChatInputCommandItem) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const groups = useMemo(() => groupChatInputCommandItems(items, triggerKind), [items, triggerKind])

  useLayoutEffect(() => {
    if (!activeItemId || !listRef.current) return

    const activeItem = listRef.current.querySelector<HTMLElement>(
      `[data-chat-input-command-item-id="${CSS.escape(activeItemId)}"]`,
    )
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [activeItemId])

  return (
    <div className='absolute inset-x-0 bottom-full z-50 mb-2 px-1'>
      <div
        className='border-border/80 bg-popover/96 relative overflow-hidden rounded-md border shadow-lg backdrop-blur-xs'
        role='listbox'
      >
        {items.length > 0 ? (
          <div ref={listRef} className='app-scrollbar-thin max-h-72 overflow-y-auto py-1'>
            {groups.map((group, groupIndex) => (
              <div key={group.id}>
                {groupIndex > 0 ? <div className='bg-border my-0.5 h-px' /> : null}
                {group.label ? (
                  <div className='text-muted-foreground/55 px-3 pt-2 pb-1 text-[10px] font-semibold tracking-[0.08em] uppercase'>
                    {group.label}
                  </div>
                ) : null}
                {group.items.map((item) => (
                  <button
                    aria-selected={activeItemId === item.id}
                    className={cn(
                      'hover:bg-transparent hover:text-inherit data-[highlighted=true]:bg-transparent data-[highlighted=true]:text-inherit flex w-full min-w-0 cursor-pointer items-center gap-2 px-2 py-2 text-left text-xs select-none',
                      activeItemId === item.id && 'bg-accent! text-accent-foreground!',
                    )}
                    data-chat-input-command-item-id={item.id}
                    key={item.id}
                    role='option'
                    type='button'
                    onClick={() => onSelect(item)}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => {
                      if (activeItemId !== item.id) onActiveItemChange(item.id)
                    }}
                  >
                    <ChatInputCommandItemIcon item={item} />
                    <span className='flex min-w-0 flex-1 items-center gap-2'>
                      <span className='shrink-0 font-medium'>{item.label}</span>
                      <span className='text-muted-foreground/70 min-w-0 flex-1 truncate text-xs'>
                        {item.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className='px-3 py-2'>
            {triggerKind === 'slash-command' ? (
              <div className='text-muted-foreground/55 pb-1 text-[10px] font-semibold tracking-[0.08em] uppercase'>
                Built-in
              </div>
            ) : null}
            <p className='text-muted-foreground/70 text-xs'>
              {isLoading ? chatInputCommandMenuLoadingLabel(triggerKind) : emptyLabel}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
