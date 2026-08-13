import { toast } from 'sonner'

import { getClient } from '@/lib/client'

import type { SettingsScope } from '../state/scope-store'

/**
 * Shows the raw settings document.
 *
 * Served by a dedicated route rather than opened as a workspace file: the fs
 * root is `/` in development but a temp directory in tests, so a settings file
 * outside it would be unreachable through the file routes. The dedicated route
 * works in both, and it lets the server refuse a save into a broken document
 * with a typed error.
 *
 * Safe to display at all only because secrets live in a separate file — this
 * text is exactly what is on disk.
 */
export async function openSettingsJson(target: SettingsScope) {
  const response = await getClient().settings.raw.get({ query: { target } })
  const text = response.data?.text ?? ''

  await navigator.clipboard?.writeText(text)
  toast.success('settings.json copied to the clipboard', {
    description:
      text.trim() === '' ? 'The file is empty — nothing has been changed yet.' : undefined,
  })
}
