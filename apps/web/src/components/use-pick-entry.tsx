import { FilePickerDialog, type FilePickerMode } from '@/components/file-picker-dialog'
import { log } from '@/lib/client-logging'
import { errorMessage } from '@/lib/file-server'
import { isDirectoryEntry, isFileEntry, type PickedFsEntry } from '@/lib/file-system-types'
import { getPlatformBridge } from '@/lib/platform/bridge'
import { hydratePickedEntry } from '@/lib/platform/hydrate-picked-entry'
import { useEffect } from 'react'
import { toast } from 'sonner'

type UsePickEntryOptions = {
  accept?: readonly string[]
  mode?: FilePickerMode
  open: boolean
  value: PickedFsEntry | null
  onOpenChange: (open: boolean) => void
  onPick: (entry: PickedFsEntry) => void
}

let nativePickPromise: Promise<string | null> | null = null

export function usePickEntry({
  accept,
  mode = 'folder',
  open,
  value,
  onOpenChange,
  onPick,
}: UsePickEntryOptions) {
  const bridge = getPlatformBridge()

  useEffect(() => {
    if (!bridge) return
    if (!open) return

    let active = true
    const pickPromise = startNativePick({
      accept,
      bridge,
      mode,
      value,
    })
    void handleNativePickResult(pickPromise, {
      isActive: () => active,
      mode,
      onOpenChange,
      onPick,
    })

    return () => {
      active = false
    }
  }, [accept, bridge, mode, onOpenChange, onPick, open, value])

  if (bridge || !open) return null

  return (
    <FilePickerDialog
      accept={accept}
      mode={mode}
      onOpenChange={onOpenChange}
      onPick={onPick}
      open={open}
      value={value}
    />
  )
}

type PickNativeEntryOptions = {
  accept?: readonly string[]
  bridge: NonNullable<ReturnType<typeof getPlatformBridge>>
  mode: FilePickerMode
  value: PickedFsEntry | null
}

type NativePickResultHandlers = {
  isActive: () => boolean
  mode: FilePickerMode
  onOpenChange: (open: boolean) => void
  onPick: (entry: PickedFsEntry) => void
}

function startNativePick(options: PickNativeEntryOptions) {
  nativePickPromise ??= pickNativeEntry(options).finally(() => {
    nativePickPromise = null
  })

  return nativePickPromise
}

async function handleNativePickResult(
  pickPromise: Promise<string | null>,
  { isActive, mode, onOpenChange, onPick }: NativePickResultHandlers,
) {
  const controller = new AbortController()
  const path = await selectedNativePath(pickPromise, isActive)
  if (!isActive()) return
  if (!path) return onOpenChange(false)

  log.info({
    action: 'platform.native_picker.selected',
    area: 'platform',
    path,
  })

  try {
    const entry = await hydratePickedEntry(path, controller.signal)
    if (!isActive()) return

    assertEntryMatchesMode(entry, mode)
    onPick(entry)
  } catch (error) {
    if (!isActive()) return

    toast.error('Could not open selected path', {
      description: errorMessage(error),
    })
  } finally {
    if (isActive()) onOpenChange(false)
  }
}

async function selectedNativePath(
  pickPromise: Promise<string | null>,
  isActive: () => boolean,
): Promise<string | null> {
  try {
    return await pickPromise
  } catch (error) {
    if (isActive()) {
      log.warn({
        action: 'platform.native_picker.failed',
        area: 'platform',
        message: errorMessage(error),
      })
    }

    return null
  }
}

async function pickNativeEntry({
  accept,
  bridge,
  mode,
  value,
}: PickNativeEntryOptions): Promise<string | null> {
  const paths = await bridge.pickEntry({ accept, mode, startingPath: value?.path })
  const path = paths[0]
  if (!path) return null

  return path
}

function assertEntryMatchesMode(entry: PickedFsEntry, mode: FilePickerMode) {
  if (mode === 'folder' && isDirectoryEntry(entry)) return
  if (mode === 'file' && isFileEntry(entry)) return

  throw new Error(mode === 'folder' ? 'Picked path is not a folder.' : 'Picked path is not a file.')
}
