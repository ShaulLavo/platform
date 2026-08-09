import { toast } from 'sonner'

import { log } from '@/lib/client-logging'

/**
 * Copy-with-feedback, shared by every menu that offers a Copy Path style
 * action. Reports success and failure the same way everywhere.
 */
export async function copyTextToClipboard(text: string, label: string) {
  if (!navigator.clipboard?.writeText) {
    toast.error('Clipboard is unavailable')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Copied ${label}`)
  } catch (error) {
    log.warn({
      action: 'clipboard.copy_failed',
      area: 'command',
      error,
      label,
    })
    toast.error(`Could not copy ${label}`)
  }
}
