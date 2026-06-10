import type { FsEntry, PickedFsEntry } from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import { FolderOpenIcon, MagnifyingGlassIcon, ProhibitIcon } from '@phosphor-icons/react'
import { Separator } from '@workspace/ui/components/separator'

import { EntryIcon, EntryPreviewTile, KindBadge } from './entry-ui'
import {
  displayPath,
  formatModified,
  formatSize,
  kindLabel,
  parentPath,
  pickerCopy,
  type FilePickerIconMode,
  type FilePickerMode,
} from './model'

export function PreviewPane({
  currentPath,
  entry,
  iconMode,
  isSearching,
  mode,
}: {
  currentPath: string
  entry: FsEntry | null
  iconMode: FilePickerIconMode
  isSearching: boolean
  mode: FilePickerMode
}) {
  return (
    <aside className='bg-muted/15 hidden min-h-0 border-l lg:flex lg:flex-col'>
      <div className='text-muted-foreground border-b px-3 py-2 text-[11px] font-medium tracking-normal uppercase'>
        Preview
      </div>
      <div className='flex min-h-0 flex-1 flex-col p-4'>
        {entry ? (
          <EntryPreviewDetails entry={entry} iconMode={iconMode} />
        ) : (
          <NoPreview currentPath={currentPath} isSearching={isSearching} mode={mode} />
        )}
      </div>
    </aside>
  )
}

export function SelectedSummary({
  entry,
  iconMode,
  mode,
}: {
  entry: PickedFsEntry | null
  iconMode: FilePickerIconMode
  mode: FilePickerMode
}) {
  const copy = pickerCopy(mode)

  if (!entry) {
    return (
      <div className='text-muted-foreground flex min-w-0 items-center gap-2 text-xs'>
        <ProhibitIcon className='size-4 shrink-0' />
        {copy.noSelectionLabel}
      </div>
    )
  }

  return (
    <div className='flex min-w-0 items-center gap-2 text-xs'>
      <EntryIcon className='size-4' entry={entry} iconMode={iconMode} selected={false} />
      <div className='min-w-0'>
        <div className='truncate font-medium'>{entry.name}</div>
        <div className='text-muted-foreground truncate'>{displayPath(entry.path)}</div>
      </div>
    </div>
  )
}

function EntryPreviewDetails({
  entry,
  iconMode,
}: {
  entry: FsEntry
  iconMode: FilePickerIconMode
}) {
  return (
    <div className='flex min-h-0 flex-1 flex-col items-center text-center'>
      <EntryPreviewTile entry={entry} iconMode={iconMode} selected={false} size='lg' />
      <div className='mt-3 w-full min-w-0'>
        <div className='truncate text-sm font-medium'>{entry.name}</div>
        <div className='text-muted-foreground mt-1 truncate font-mono text-[11px]'>
          {displayPath(entry.path)}
        </div>
      </div>
      <div className='mt-3'>
        <KindBadge entry={entry} />
      </div>
      <Separator className='my-4' />
      <dl className='grid w-full gap-2 text-left text-xs'>
        <PreviewFact label='Kind' value={kindLabel(entry)} />
        {!isDirectoryEntry(entry) && <PreviewFact label='Size' value={formatSize(entry.size)} />}
        <PreviewFact label='Modified' value={formatModified(entry.mtimeMs)} />
        <PreviewFact label='Created' value={formatModified(entry.birthtimeMs)} />
        <PreviewFact label='Location' value={displayPath(parentPath(entry.path))} />
      </dl>
    </div>
  )
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className='grid grid-cols-[74px_minmax(0,1fr)] gap-2'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='text-foreground truncate tabular-nums'>{value}</dd>
    </div>
  )
}

function NoPreview({
  currentPath,
  isSearching,
  mode,
}: {
  currentPath: string
  isSearching: boolean
  mode: FilePickerMode
}) {
  const copy = pickerCopy(mode)

  return (
    <div className='flex min-h-0 flex-1 flex-col items-center justify-center text-center'>
      <div className='bg-background text-muted-foreground flex size-20 items-center justify-center rounded-lg border shadow-xs'>
        {isSearching ? (
          <MagnifyingGlassIcon className='size-8' />
        ) : (
          <FolderOpenIcon className='size-8' weight='duotone' />
        )}
      </div>
      <div className='mt-3 text-sm font-medium'>{copy.emptyPreviewTitle}</div>
      <p className='text-muted-foreground mt-1 max-w-40 text-xs'>
        {`Previewing ${displayPath(currentPath)}`}
      </p>
    </div>
  )
}
