import {
  ArrowDownIcon,
  ArrowUpIcon,
  CrosshairIcon,
  EraserIcon,
  FilePlusIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  XIcon,
} from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'

export function TreeToolbar({
  isSearchOpen,
  matchCount,
  onClearSearch,
  onCloseSearch,
  onNewFile,
  onNewFolder,
  onNextMatch,
  onOpenSearch,
  onPreviousMatch,
  onRevealActiveFile,
  query,
}: {
  readonly isSearchOpen: boolean
  readonly matchCount: number
  readonly onClearSearch: () => void
  readonly onCloseSearch: () => void
  readonly onNewFile: () => void
  readonly onNewFolder: () => void
  readonly onNextMatch: () => void
  readonly onOpenSearch: () => void
  readonly onPreviousMatch: () => void
  readonly onRevealActiveFile: () => void
  readonly query: string
}) {
  const hasQuery = query.length > 0
  const hasMatches = hasQuery && matchCount > 0
  const matchLabel = `${String(matchCount)} file ${matchCount === 1 ? 'match' : 'matches'}`

  return (
    <div
      aria-label='File tree actions'
      className='border-border flex min-w-0 items-center justify-between gap-1 border-b px-1 py-0.5'
      role='toolbar'
    >
      <div className='flex shrink-0 items-center gap-0.5'>
        <Button
          aria-label='New file at workspace root'
          size='icon-xs'
          title='New File'
          type='button'
          variant='ghost'
          onClick={onNewFile}
        >
          <FilePlusIcon className='size-3.5' />
        </Button>
        <Button
          aria-label='New folder at workspace root'
          size='icon-xs'
          title='New Folder'
          type='button'
          variant='ghost'
          onClick={onNewFolder}
        >
          <FolderPlusIcon className='size-3.5' />
        </Button>
      </div>

      <div className='flex min-w-0 items-center justify-end gap-0.5'>
        {isSearchOpen ? (
          <>
            {hasQuery ? (
              <output
                aria-label={matchLabel}
                aria-live='polite'
                className='text-muted-foreground min-w-0 truncate px-1 text-[10px] tabular-nums'
              >
                {matchCount} {matchCount === 1 ? 'match' : 'matches'}
              </output>
            ) : null}
            <Button
              aria-label='Previous file match'
              disabled={!hasMatches}
              size='icon-xs'
              title='Previous Match'
              type='button'
              variant='ghost'
              onClick={onPreviousMatch}
            >
              <ArrowUpIcon className='size-3.5' />
            </Button>
            <Button
              aria-label='Next file match'
              disabled={!hasMatches}
              size='icon-xs'
              title='Next Match'
              type='button'
              variant='ghost'
              onClick={onNextMatch}
            >
              <ArrowDownIcon className='size-3.5' />
            </Button>
            <Button
              aria-label='Clear file filter'
              disabled={!hasQuery}
              size='icon-xs'
              title='Clear Filter'
              type='button'
              variant='ghost'
              onClick={onClearSearch}
            >
              <EraserIcon className='size-3.5' />
            </Button>
            <Button
              aria-label='Close file filter'
              size='icon-xs'
              title='Close Filter'
              type='button'
              variant='ghost'
              onClick={onCloseSearch}
            >
              <XIcon className='size-3.5' />
            </Button>
          </>
        ) : (
          <Button
            aria-label='Filter files'
            size='icon-xs'
            title='Filter Files'
            type='button'
            variant='ghost'
            onClick={onOpenSearch}
          >
            <MagnifyingGlassIcon className='size-3.5' />
          </Button>
        )}
        <Button
          aria-label='Reveal active file in tree'
          size='icon-xs'
          title='Reveal Active File'
          type='button'
          variant='ghost'
          onClick={onRevealActiveFile}
        >
          <CrosshairIcon className='size-3.5' />
        </Button>
      </div>
    </div>
  )
}
