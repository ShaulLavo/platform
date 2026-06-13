import { errorMessage } from '@/lib/error-message'
import type { PickedFsEntry } from '@/lib/file-system-types'
import { isDirectoryEntry } from '@/lib/file-system-types'
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckIcon,
  HardDrivesIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Separator } from '@workspace/ui/components/separator'
import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  useDirectoryLoad,
  useRecentEntries,
  useRecordRecentMutation,
  useServerInfoForOpen,
} from './file-picker/data'
import { IconTooltip } from './file-picker/icon-tooltip'
import { FileList, ListHeader } from './file-picker/list'
import { Breadcrumbs } from './file-picker/navigation/breadcrumbs'
import { MobileLocations } from './file-picker/navigation/mobile-locations'
import { PlacesSidebar } from './file-picker/navigation/places-sidebar'
import { PreviewPane, SelectedSummary } from './file-picker/preview'
import {
  ROOT_PATH,
  currentPickableEntry,
  entryByOffset,
  isPickableEntry,
  loadStateEntries,
  parentPath,
  pickerCopy,
  toPickedEntry,
  type EntriesLoadState,
  type FilePickerIconMode,
  type FilePickerMode,
} from './file-picker/model'
import { useFilePickerSession } from './file-picker/state'

type FilePickerDialogProps = {
  accept?: readonly string[]
  iconMode?: FilePickerIconMode
  mode?: FilePickerMode
  open: boolean
  value: PickedFsEntry | null
  onOpenChange: (open: boolean) => void
  onPick: (entry: PickedFsEntry) => void
}

export type { FilePickerMode }

export function FilePickerDialog({
  accept,
  iconMode = 'default',
  mode = 'folder',
  open,
  value,
  onOpenChange,
  onPick,
}: FilePickerDialogProps) {
  const session = useFilePickerSession(value)
  const { serverInfo, serverInfoError } = useServerInfoForOpen(
    open,
    session.initializeOpenSession,
    session.resetOpenSession,
  )
  const [reloadVersion, setReloadVersion] = useState(0)
  const recordRecentMutation = useRecordRecentMutation()
  const { currentEntry, loadState: directoryLoadState } = useDirectoryLoad({
    currentPath: session.currentPath,
    effectiveQuery: session.effectiveQuery,
    mode,
    open,
    reloadVersion,
    serverInfo,
  })
  const recentState = useRecentEntries({
    open,
    reloadVersion,
    serverInfo,
  })
  const loadState: EntriesLoadState = serverInfoError
    ? {
        status: 'error',
        message: errorMessage(serverInfoError, 'The file server did not return a usable response.'),
      }
    : directoryLoadState
  const visibleEntries = loadStateEntries(loadState)
  const isLoadingEntries = loadState.status === 'loading'
  const isSearching = session.effectiveQuery.trim().length > 0
  const previewEntry = session.selectedEntry ?? currentEntry
  const selectedPickable =
    toPickedEntry(session.selectedEntry, mode, accept) ?? currentPickableEntry(currentEntry, mode)
  const homePath = serverInfo?.homePath ?? ROOT_PATH
  const copy = pickerCopy(mode)

  function refresh() {
    setReloadVersion((version) => version + 1)
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>) {
    session.setQuery(event.target.value)
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') return selectByOffset(event, 1)
    if (event.key === 'ArrowUp') return selectByOffset(event, -1)
    if (event.key === 'Enter') return commitFromKeyboard(event)
    if (event.key === 'ArrowRight') return enterDirectory(event)
    if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
      return leaveDirectory(event)
    }
  }

  function selectByOffset(event: KeyboardEvent<HTMLDivElement>, offset: number) {
    event.preventDefault()

    const pickable = visibleEntries.filter((entry) => isPickableEntry(entry, mode, accept))
    const nextEntry = entryByOffset(pickable, session.selectedEntry, offset)
    if (!nextEntry) return

    session.setSelectedEntry(nextEntry)
  }

  function commitFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (!selectedPickable) return

    event.preventDefault()
    chooseSelected()
  }

  function enterDirectory(event: KeyboardEvent<HTMLDivElement>) {
    if (!session.selectedEntry || !isDirectoryEntry(session.selectedEntry)) {
      return
    }

    event.preventDefault()
    session.navigateTo(session.selectedEntry.path)
  }

  function leaveDirectory(event: KeyboardEvent<HTMLDivElement>) {
    if (!session.canGoUp) return

    event.preventDefault()
    session.navigateTo(parentPath(session.currentPath))
  }

  function chooseSelected() {
    if (!selectedPickable) return

    void commitPick(selectedPickable)
  }

  async function commitPick(entry: PickedFsEntry) {
    if (isDirectoryEntry(entry)) {
      await recordRecentMutation.mutateAsync(entry).catch(() => null)
    }

    onPick(entry)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='bg-background flex h-[min(760px,calc(100svh-2rem))] w-[min(1080px,calc(100vw-1.5rem))] max-w-none flex-col gap-0 overflow-hidden rounded-xl border p-0 text-sm shadow-2xl sm:max-w-none'
        showCloseButton={false}
      >
        <div className='bg-muted/35 border-b px-4 py-3'>
          <div className='flex items-center justify-between gap-3'>
            <DialogHeader className='min-w-0 gap-1'>
              <DialogTitle className='flex items-center gap-2 text-sm'>
                <span className='border-info/20 bg-info/10 text-info flex size-7 items-center justify-center rounded-md border'>
                  <HardDrivesIcon weight='duotone' />
                </span>
                {copy.title}
              </DialogTitle>
              <DialogDescription>Browsing your home directory.</DialogDescription>
            </DialogHeader>
            <div className='flex shrink-0 items-center gap-1'>
              <IconTooltip label='Back'>
                <Button
                  aria-label='Back'
                  disabled={!session.canGoBack}
                  onClick={session.goBack}
                  size='icon-sm'
                  type='button'
                  variant='ghost'
                >
                  <ArrowLeftIcon />
                </Button>
              </IconTooltip>
              <IconTooltip label='Up one folder'>
                <Button
                  aria-label='Up one folder'
                  disabled={!session.canGoUp}
                  onClick={() => session.navigateTo(parentPath(session.currentPath))}
                  size='icon-sm'
                  type='button'
                  variant='ghost'
                >
                  <ArrowUpIcon />
                </Button>
              </IconTooltip>
              <IconTooltip label='Refresh'>
                <Button
                  aria-label='Refresh'
                  onClick={refresh}
                  size='icon-sm'
                  type='button'
                  variant='ghost'
                >
                  <ArrowClockwiseIcon />
                </Button>
              </IconTooltip>
            </div>
          </div>
          <div className='mt-3 grid gap-2 lg:grid-cols-[170px_minmax(0,1fr)_240px]'>
            <div className='hidden lg:block' />
            <Breadcrumbs currentPath={session.currentPath} onNavigate={session.navigateTo} />
            <div className='relative'>
              <MagnifyingGlassIcon className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2' />
              <Input
                aria-label={copy.searchLabel}
                className='h-8 pl-8'
                onChange={handleSearchChange}
                placeholder={copy.searchPlaceholder}
                value={session.query}
              />
            </div>
          </div>
          <MobileLocations
            currentPath={session.currentPath}
            homePath={homePath}
            onNavigate={session.jumpTo}
            recentState={recentState}
          />
        </div>

        <div className='grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[170px_minmax(0,1fr)_240px]'>
          <PlacesSidebar
            currentPath={session.currentPath}
            homePath={homePath}
            onNavigate={session.jumpTo}
            recentState={recentState}
          />
          <div className='grid min-h-0 grid-rows-[auto_minmax(0,1fr)]'>
            <ListHeader isLoading={isLoadingEntries} isSearching={isSearching} />
            <FileList
              entries={visibleEntries}
              accept={accept}
              iconMode={iconMode}
              isSearching={isSearching}
              loadState={loadState}
              mode={mode}
              onKeyDown={handleListKeyDown}
              onNavigate={session.navigateTo}
              onRetry={refresh}
              onSelect={session.setSelectedEntry}
              selectedPath={session.selectedEntry?.path ?? null}
            />
          </div>
          <PreviewPane
            currentPath={session.currentPath}
            entry={previewEntry}
            iconMode={iconMode}
            isSearching={isSearching}
            mode={mode}
          />
        </div>

        <Separator />
        <DialogFooter className='bg-muted/20 grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
          <SelectedSummary entry={selectedPickable} iconMode={iconMode} mode={mode} />
          <div className='flex justify-end gap-2'>
            <Button onClick={() => onOpenChange(false)} type='button' variant='outline'>
              Cancel
            </Button>
            <Button disabled={!selectedPickable} onClick={chooseSelected} type='button'>
              <CheckIcon data-icon='inline-start' />
              {copy.chooseLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
