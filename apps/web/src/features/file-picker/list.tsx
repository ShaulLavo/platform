import type { FsEntry } from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import {
  ArrowClockwiseIcon,
  CircleNotchIcon,
  FolderOpenIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { EmptyState } from '@workspace/ui/components/empty-state'
import { cn } from '@workspace/ui/lib/utils'
import { useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react'

import { useFilePickerSessionActions } from '@/features/file-picker/hooks/use-file-picker-session-actions'
import { EntryPreviewTile, KindBadge } from '@/features/file-picker/entry-ui'
import {
  displayPath,
  formatModified,
  formatSizeLabel,
  isPickableEntry,
  listLabel,
  pickerCopy,
  type EntriesLoadState,
  type FilePickerIconMode,
  type FilePickerMode,
} from '@/features/file-picker/model'

export function ListHeader({
  isLoading,
  isSearching,
}: {
  isLoading: boolean
  isSearching: boolean
}) {
  return (
    <div className='bg-background backdrop-material text-muted-foreground grid h-8 grid-cols-[minmax(0,1fr)_80px_116px_74px] items-center gap-3 border-b px-3 text-[11px] font-medium tracking-normal uppercase max-sm:grid-cols-[minmax(0,1fr)_68px]'>
      <div className='flex min-w-0 items-center gap-2'>
        <span>{isSearching ? 'Matches' : 'Name'}</span>
        {isLoading && <CircleNotchIcon className='size-3 animate-spin' />}
      </div>
      <div className='max-sm:text-right'>Kind</div>
      <div className='max-sm:hidden'>Modified</div>
      <div className='text-right max-sm:hidden'>Size</div>
    </div>
  )
}

export function FileList({
  accept,
  entries,
  iconMode,
  isSearching,
  loadState,
  mode,
  onKeyDown,
  onRetry,
  selectedPath,
}: {
  accept?: readonly string[]
  entries: FsEntry[]
  iconMode: FilePickerIconMode
  isSearching: boolean
  loadState: EntriesLoadState
  mode: FilePickerMode
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  onRetry: () => void
  selectedPath: string | null
}) {
  const rows = useMemo(() => fileListRows(entries, isSearching), [entries, isSearching])
  const scrollParentRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ height: 480, top: 0 })
  const rowMetrics = useMemo(() => fileListRowMetrics(rows), [rows])
  const virtualRows = useMemo(
    () => visibleFileListRows(rowMetrics, viewport),
    [rowMetrics, viewport],
  )

  if (loadState.status === 'error') {
    return (
      <EmptyState
        action={
          <Button onClick={onRetry} size='sm' type='button' variant='outline'>
            <ArrowClockwiseIcon data-icon='inline-start' />
            Retry
          </Button>
        }
        className='min-h-80 p-6'
        description={loadState.message}
        icon={<WarningCircleIcon className='size-8' weight='duotone' />}
        title='Could not load this folder'
        tone='error'
      />
    )
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        className='min-h-80 p-6'
        description={pickerCopy(mode).emptyDescription}
        icon={<FolderOpenIcon className='size-8' weight='duotone' />}
        title='Nothing here'
      />
    )
  }

  return (
    <div
      ref={scrollParentRef}
      className='min-h-0 overflow-auto'
      onScroll={handleFileListScroll(setViewport)}
    >
      <div
        aria-label={listLabel(mode)}
        className='relative p-1.5 outline-none'
        onKeyDown={onKeyDown}
        role='listbox'
        style={{ height: rowMetrics.totalSize }}
        tabIndex={0}
      >
        {virtualRows.map((virtualRow) => (
          <FileListVirtualRow
            key={virtualRow.key}
            accept={accept}
            iconMode={iconMode}
            mode={mode}
            row={rows[virtualRow.index]}
            selectedPath={selectedPath}
            virtualRow={virtualRow}
          />
        ))}
      </div>
    </div>
  )
}

type FileListRow =
  | {
      kind: 'section'
      key: string
      label: string
    }
  | {
      kind: 'entry'
      key: string
      entry: FsEntry
      showPath: boolean
    }

type FileListVirtualItem = {
  index: number
  key: string
  size: number
  start: number
}

type FileListRowMetrics = {
  items: readonly FileListVirtualItem[]
  totalSize: number
}

function FileListVirtualRow({
  accept,
  iconMode,
  mode,
  row,
  selectedPath,
  virtualRow,
}: {
  accept?: readonly string[]
  iconMode: FilePickerIconMode
  mode: FilePickerMode
  row: FileListRow | undefined
  selectedPath: string | null
  virtualRow: FileListVirtualItem
}) {
  if (!row) return null

  return (
    <div
      className='absolute top-0 right-1.5 left-1.5'
      style={{ transform: `translateY(${virtualRow.start}px)` }}
    >
      {row.kind === 'section' ? (
        <div className='text-muted-foreground px-2 py-1.5 text-[11px] font-medium tracking-normal uppercase'>
          {row.label}
        </div>
      ) : (
        <FileRow
          accept={accept}
          entry={row.entry}
          iconMode={iconMode}
          mode={mode}
          selected={row.entry.path === selectedPath}
          showPath={row.showPath}
        />
      )}
    </div>
  )
}

function fileListRows(entries: FsEntry[], isSearching: boolean): FileListRow[] {
  if (!isSearching || !entries.some(hasSearchScope)) {
    return entries.map((entry) => ({
      kind: 'entry',
      key: entry.path,
      entry,
      showPath: false,
    }))
  }

  return searchResultSections(entries).flatMap((section) =>
    section.entries.length === 0
      ? []
      : [
          {
            kind: 'section',
            key: `section:${section.scope}`,
            label: section.label,
          },
          ...section.entries.map((entry) => ({
            kind: 'entry' as const,
            key: `${section.scope}:${entry.path}`,
            entry,
            showPath: true,
          })),
        ],
  )
}

function estimatedFileListRowSize(row: FileListRow | undefined) {
  if (row?.kind === 'section') return 28

  return 44
}

function fileListRowKey(row: FileListRow | undefined, index: number) {
  return row?.key ?? `missing:${index}`
}

function fileListRowMetrics(rows: readonly FileListRow[]): FileListRowMetrics {
  const items: FileListVirtualItem[] = []
  let totalSize = 0

  for (let index = 0; index < rows.length; index += 1) {
    const size = estimatedFileListRowSize(rows[index])
    items.push({
      index,
      key: fileListRowKey(rows[index], index),
      size,
      start: totalSize,
    })
    totalSize += size
  }

  return { items, totalSize }
}

function visibleFileListRows(
  metrics: FileListRowMetrics,
  viewport: { height: number; top: number },
) {
  const overscan = 12
  const start = Math.max(0, viewport.top - viewport.height)
  const end = viewport.top + viewport.height * 2
  const visible = metrics.items.filter(
    (item) => item.start + item.size >= start && item.start <= end,
  )
  if (visible.length > 0) return visible

  return metrics.items.slice(0, overscan)
}

function handleFileListScroll(setViewport: (viewport: { height: number; top: number }) => void) {
  return (event: UIEvent<HTMLDivElement>) => {
    setViewport({
      height: event.currentTarget.clientHeight,
      top: event.currentTarget.scrollTop,
    })
  }
}

function hasSearchScope(entry: FsEntry) {
  return entry.searchScope === 'current' || entry.searchScope === 'system'
}

function searchResultSections(entries: FsEntry[]) {
  return [
    {
      scope: 'current' as const,
      label: 'Current folder',
      entries: entries.filter((entry) => entry.searchScope === 'current'),
    },
    {
      scope: 'system' as const,
      label: 'System-wide',
      entries: entries.filter((entry) => entry.searchScope === 'system'),
    },
  ]
}

function FileRow({
  accept,
  entry,
  iconMode,
  mode,
  selected,
  showPath,
}: {
  accept?: readonly string[]
  entry: FsEntry
  iconMode: FilePickerIconMode
  mode: FilePickerMode
  selected: boolean
  showPath: boolean
}) {
  const { navigateTo, selectEntry } = useFilePickerSessionActions()
  const pickable = isPickableEntry(entry, mode, accept)
  const interactive = pickable || isDirectoryEntry(entry)

  function handleDoubleClick() {
    if (isDirectoryEntry(entry)) return navigateTo(entry.path)
  }

  return (
    <button
      aria-disabled={!pickable}
      aria-selected={selected}
      className={cn(
        'grid h-11 w-full grid-cols-[minmax(0,1fr)_80px_116px_74px] items-center gap-3 rounded-md px-1.5 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring/50 max-sm:grid-cols-[minmax(0,1fr)_68px]',
        'active:scale-[0.995] motion-reduce:active:scale-100',
        selected && 'bg-row-selected text-foreground',
        !selected && interactive && 'hover:bg-row-hover',
        !interactive && 'cursor-not-allowed text-muted-foreground/60',
        interactive && !pickable && 'text-muted-foreground/75',
      )}
      disabled={!interactive}
      onClick={() => selectEntry(entry)}
      onDoubleClick={handleDoubleClick}
      role='option'
      type='button'
    >
      <div className='flex min-w-0 items-center gap-2'>
        <EntryPreviewTile entry={entry} iconMode={iconMode} selected={selected} size='sm' />
        <div className='min-w-0'>
          <div className='truncate font-medium'>{entry.name}</div>
          <div
            className={cn('truncate text-[11px] text-muted-foreground', !showPath && 'sm:hidden')}
          >
            {displayPath(entry.path)}
          </div>
        </div>
      </div>
      <KindBadge entry={entry} />
      <div className='text-muted-foreground truncate tabular-nums max-sm:hidden'>
        {formatModified(entry.mtimeMs)}
      </div>
      <div className='text-muted-foreground text-right tabular-nums max-sm:hidden'>
        {formatSizeLabel(entry)}
      </div>
    </button>
  )
}
