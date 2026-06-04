import { FilePickerDialog, type FilePickerMode } from '@/components/file-picker-dialog'
import { errorMessage } from '@/lib/file-server'
import type { PickedFsEntry } from '@/lib/file-system-types'
import { getPlatformBridge } from '@/lib/platform/bridge'
import { hydratePickedEntry } from '@/lib/platform/hydrate-picked-entry'
import { useEffect, useRef, type MutableRefObject } from 'react'
import { toast } from 'sonner'

type UsePickEntryOptions = {
  accept?: readonly string[]
  mode?: FilePickerMode
  open: boolean
  value: PickedFsEntry | null
  onOpenChange: (open: boolean) => void
  onPick: (entry: PickedFsEntry) => void
}

export function usePickEntry({
  accept,
  mode = 'folder',
  open,
  value,
  onOpenChange,
  onPick,
}: UsePickEntryOptions) {
  const bridge = getPlatformBridge()
  const activeNativePick = useRef<symbol | null>(null)

  useEffect(() => {
    if (!bridge) return
    if (!open) {
      activeNativePick.current = null
      return
    }
    if (activeNativePick.current) return

    const request = Symbol('native-pick-entry')
    activeNativePick.current = request
    void pickNativeEntry({
      accept,
      bridge,
      mode,
      onOpenChange,
      onPick,
      request,
      requestRef: activeNativePick,
      value,
    })
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
  onOpenChange: (open: boolean) => void
  onPick: (entry: PickedFsEntry) => void
  request: symbol
  requestRef: MutableRefObject<symbol | null>
  value: PickedFsEntry | null
}

async function pickNativeEntry({
  accept,
  bridge,
  mode,
  onOpenChange,
  onPick,
  request,
  requestRef,
  value,
}: PickNativeEntryOptions) {
  const controller = new AbortController()

  try {
    const paths = await bridge.pickEntry({ accept, mode, startingPath: value?.path })
    const path = paths[0]
    if (!path) return

    const entry = await hydratePickedEntry(path, controller.signal)
    if (requestRef.current !== request) return

    onPick(entry)
  } catch (error) {
    if (requestRef.current !== request) return

    toast.error('Could not open selected path', {
      description: errorMessage(error),
    })
  } finally {
    if (requestRef.current === request) {
      requestRef.current = null
      onOpenChange(false)
    }
  }
}
