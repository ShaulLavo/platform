import { CaretRightIcon } from '@phosphor-icons/react'
import { memo, useCallback, useMemo } from 'react'

import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'

import { fileIconStyle, fileName, matchNoun } from '@/features/search/search-result-editor-utils'
import type { SearchResultFileBlock } from '@/features/search/search-result-view-model'
import { iconForEntry } from '@/lib/file-icons'

type SearchResultFileHeaderProps = {
  active: boolean
  canReplace?: boolean
  file: SearchResultFileBlock
  replaceVisible: boolean
  onReplaceFile?: (path: string) => void
  onToggleFile: (path: string) => void
}

export const SearchResultFileHeader = memo(
  ({
    active,
    canReplace,
    file,
    replaceVisible,
    onReplaceFile,
    onToggleFile,
  }: SearchResultFileHeaderProps) => {
    const name = fileName(file.path)
    const icon = useMemo(() => iconForEntry({ name, type: 'file' }), [name])
    const handleReplace = useCallback(() => onReplaceFile?.(file.path), [file.path, onReplaceFile])
    const handleToggle = useCallback(() => onToggleFile(file.path), [file.path, onToggleFile])

    return (
      <div
        className={cn(
          'grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1.5 rounded-sm border-l border-transparent px-2 py-1.5 text-left',
          active &&
            'bg-muted/70 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--border)_55%,transparent)]',
          !active && 'hover:bg-muted/45',
        )}
      >
        <button
          aria-label={file.collapsed ? 'Expand file results' : 'Collapse file results'}
          className='text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 grid size-5 place-items-center rounded-sm outline-none focus-visible:ring-1'
          disabled={file.excerpts.length === 0}
          tabIndex={-1}
          type='button'
          onClick={handleToggle}
        >
          <CaretRightIcon
            className={cn(
              'size-3.5 transition-transform',
              !file.collapsed && file.excerpts.length > 0 && 'rotate-90',
            )}
          />
        </button>
        <div
          className='grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-1.5 text-left'
          title={file.path}
        >
          <span aria-hidden='true' className='size-4' style={fileIconStyle(icon)} />
          <span className='min-w-0'>
            <span className='block truncate text-xs font-medium'>{name}</span>
            <span className='text-muted-foreground block truncate text-[11px]'>
              {file.pathLabel}
            </span>
          </span>
        </div>
        <span className='bg-muted/55 text-muted-foreground rounded-sm px-1.5 text-[10px] leading-4'>
          {file.matchCount.toLocaleString()} {matchNoun(file.matchCount)}
        </span>
        {replaceVisible ? (
          <Button
            className='h-6 px-1.5 text-[10px]'
            disabled={!canReplace}
            size='xs'
            title='Replace matches in this file'
            type='button'
            variant='ghost'
            onClick={handleReplace}
          >
            Replace
          </Button>
        ) : null}
      </div>
    )
  },
)
