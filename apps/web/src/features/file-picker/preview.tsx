import type { FsEntry, PickedFsEntry } from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import { FolderOpenIcon, MagnifyingGlassIcon, ProhibitIcon } from '@phosphor-icons/react'
import { Separator } from '@workspace/ui/components/separator'

import { EntryIcon, EntryPreviewTile, KindBadge } from '@/features/file-picker/entry-ui'
import {
  formatModified,
  formatSize,
  kindLabel,
  pickerCopy,
  type FilePickerIconMode,
  type FilePickerMode,
} from '@/features/file-picker/model'

export function PreviewPane({
  entry,
  iconMode,
  isSearching,
  mode,
}: {
  entry: FsEntry | null
  iconMode: FilePickerIconMode
  isSearching: boolean
  mode: FilePickerMode
}) {
  return (
    <aside className='hidden min-h-0 lg:flex lg:flex-col'>
      <div className='border-border/60 text-muted-foreground/70 flex h-[26px] shrink-0 items-center border-b px-3 text-[10px] font-medium tracking-wide uppercase'>
        Preview
      </div>
      <div className='flex min-h-0 flex-1 flex-col p-3'>
        {entry ? (
          <EntryPreviewDetails entry={entry} iconMode={iconMode} />
        ) : (
          <NoPreview isSearching={isSearching} mode={mode} />
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
      <span className='truncate font-medium'>{entry.name}</span>
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
      <div className='mt-2.5 w-full min-w-0'>
        <div className='truncate text-xs font-medium'>{entry.name}</div>
      </div>
      <div className='mt-2'>
        <KindBadge entry={entry} />
      </div>
      <Separator className='my-3' />
      <dl className='grid w-full gap-1.5 text-left text-[11px]'>
        <PreviewFact label='Kind' value={kindLabel(entry)} />
        {!isDirectoryEntry(entry) && <PreviewFact label='Size' value={formatSize(entry.size)} />}
        <PreviewFact label='Modified' value={formatModified(entry.mtimeMs)} />
        <PreviewFact label='Created' value={formatModified(entry.birthtimeMs)} />
      </dl>
    </div>
  )
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className='grid grid-cols-[64px_minmax(0,1fr)] gap-2'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='text-foreground min-w-0 text-right break-words tabular-nums'>{value}</dd>
    </div>
  )
}

function NoPreview({ isSearching, mode }: { isSearching: boolean; mode: FilePickerMode }) {
  const copy = pickerCopy(mode)

  return (
    <div className='flex min-h-0 flex-1 flex-col items-center justify-center text-center'>
      <div className='text-muted-foreground/40 flex items-center justify-center'>
        {isSearching ? (
          <MagnifyingGlassIcon className='size-7' />
        ) : (
          <FolderOpenIcon className='size-7' weight='duotone' />
        )}
      </div>
      <div className='text-muted-foreground mt-2 text-[11px]'>{copy.emptyPreviewTitle}</div>
    </div>
  )
}
