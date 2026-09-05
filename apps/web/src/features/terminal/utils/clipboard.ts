import { toast } from 'sonner'

import { formatChord } from '@/keymap/utils/format-keys'
import { log } from '@/lib/client-logging'

// Not in lib.dom's PermissionName union, but every Chromium engine answers it.
const CLIPBOARD_READ = 'clipboard-read' as PermissionName

/**
 * `readText` is the one clipboard call a browser can refuse outright, and the
 * terminal is the one surface where a refusal has a working alternative: the
 * hidden textarea ghostty focuses still takes a native paste. So the menu asks
 * first and disables Paste rather than offering an item that cannot work.
 *
 * A `prompt` state is not blocked — clicking Paste is the user gesture that is
 * supposed to raise the permission request.
 */
export async function isClipboardReadBlocked() {
  if (typeof navigator.clipboard?.readText !== 'function') return true
  if (typeof navigator.permissions?.query !== 'function') return false

  try {
    const status = await navigator.permissions.query({ name: CLIPBOARD_READ })
    return status.state === 'denied'
  } catch {
    // Firefox and Safari reject the descriptor instead of answering it. Let the
    // read itself decide; it degrades to the toast below.
    return false
  }
}

export async function readClipboardText() {
  try {
    return await navigator.clipboard.readText()
  } catch (error) {
    log.warn({
      action: 'clipboard.read_failed',
      area: 'terminal',
      error,
    })
    toast.error('Clipboard read was blocked', {
      description: `Press ${formatChord('mod+v')} to paste instead.`,
    })
    return null
  }
}
