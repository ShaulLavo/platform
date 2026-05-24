import { iconForEntry } from '@/lib/file-icons'
import type { FsEntry } from '@/lib/file-system-types'
import { isDirectoryEntry, isFileEntry } from '@/lib/file-system-types'
import { FileDashedIcon, FileIcon, FolderIcon, FolderOpenIcon } from '@phosphor-icons/react'
import { Badge } from '@workspace/ui/components/badge'
import { cn } from '@workspace/ui/lib/utils'

import { fileExtension, tileTone, type FilePickerIconMode } from './state'

export function EntryPreviewTile({
  entry,
  iconMode,
  selected,
  size,
}: {
  entry: FsEntry
  iconMode: FilePickerIconMode
  selected: boolean
  size: 'sm' | 'lg'
}) {
  const large = size === 'lg'
  const extension = isFileEntry(entry) ? fileExtension(entry.name) : ''

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-md border shadow-xs',
        large ? 'size-24' : 'size-7',
        tileTone(entry, selected),
      )}
    >
      <EntryIcon
        entry={entry}
        className={large ? 'size-10' : 'size-4'}
        iconMode={iconMode}
        selected={selected}
      />
      {large && extension && (
        <span className='bg-background/90 text-muted-foreground ring-border absolute right-1.5 bottom-1.5 rounded-sm px-1 py-0.5 text-[10px] font-medium uppercase ring-1'>
          {extension}
        </span>
      )}
    </span>
  )
}

export function EntryIcon({
  className,
  entry,
  iconMode,
  open,
  selected,
}: {
  className?: string
  entry: FsEntry
  iconMode: FilePickerIconMode
  open?: boolean
  selected: boolean
}) {
  const openFolder = open ?? selected

  if (iconMode === 'default') {
    return (
      <DefaultEntryIcon className={className} entry={entry} open={openFolder} selected={selected} />
    )
  }

  const icon = iconForEntry(entry, { open: openFolder })

  return (
    <img
      alt=''
      aria-hidden='true'
      className={cn('shrink-0 object-contain', className)}
      draggable={false}
      src={icon.src}
    />
  )
}

export function KindBadge({ entry }: { entry: FsEntry }) {
  if (isDirectoryEntry(entry)) {
    return (
      <Badge className='justify-center border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300'>
        Folder
      </Badge>
    )
  }

  if (isFileEntry(entry)) {
    return (
      <Badge className='justify-center border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-300'>
        File
      </Badge>
    )
  }

  return (
    <Badge className='justify-center' variant='outline'>
      Other
    </Badge>
  )
}

function DefaultEntryIcon({
  className,
  entry,
  open,
  selected,
}: {
  className?: string
  entry: FsEntry
  open: boolean
  selected: boolean
}) {
  if (isDirectoryEntry(entry)) {
    const Icon = open ? FolderOpenIcon : FolderIcon

    return (
      <Icon
        className={cn(
          'shrink-0 text-amber-500',
          selected && 'text-amber-600 dark:text-amber-300',
          className,
        )}
        weight='duotone'
      />
    )
  }

  if (isFileEntry(entry)) {
    return (
      <FileIcon
        className={cn(
          'shrink-0 text-sky-500',
          selected && 'text-sky-600 dark:text-sky-300',
          className,
        )}
        weight='duotone'
      />
    )
  }

  return <FileDashedIcon className={cn('shrink-0 text-muted-foreground', className)} />
}
