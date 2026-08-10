import { ArchiveIcon, TrashIcon, XIcon } from '@phosphor-icons/react'

import { useSessionActions } from '@/features/chat-mode/hooks/use-session-actions'
import { clearSessionMultiSelect } from '@/features/chat-mode/state/session-commands'
import { useSessionMultiSelectStore } from '@/features/chat-mode/state/session-multi-select-store'
import { Button } from '@workspace/ui/components/button'

/**
 * What a marked set is for. Without it, multi-select is a highlight — the reason to pick
 * ten finished sessions is to file or drop all ten in one gesture.
 */
export function SessionBulkBar() {
  const threadIds = useSessionMultiSelectStore((state) => state.threadIds)
  const actions = useSessionActions()

  return (
    <div
      aria-label='Selected sessions'
      className='border-border/60 flex shrink-0 items-center gap-1 border-t px-2 py-1.5'
      role='toolbar'
    >
      <span className='text-muted-foreground min-w-0 flex-1 truncate text-[11px] tabular-nums'>
        {threadIds.length} selected
      </span>
      <Button
        className='text-muted-foreground hover:text-foreground h-7 gap-1.5 rounded-md px-2 text-[11px]'
        size='sm'
        type='button'
        variant='ghost'
        onClick={() => actions.archiveSessions(threadIds)}
      >
        <ArchiveIcon className='size-3.5' />
        Archive
      </Button>
      <Button
        className='text-destructive hover:text-destructive h-7 gap-1.5 rounded-md px-2 text-[11px]'
        size='sm'
        type='button'
        variant='ghost'
        onClick={() => actions.deleteSessions(threadIds)}
      >
        <TrashIcon className='size-3.5' />
        Delete
      </Button>
      <Button
        aria-label='Clear selection'
        className='text-muted-foreground hover:text-foreground size-7 shrink-0 rounded-md'
        size='icon-sm'
        title='Clear selection'
        type='button'
        variant='ghost'
        onClick={clearSessionMultiSelect}
      >
        <XIcon className='size-3.5' />
      </Button>
    </div>
  )
}
