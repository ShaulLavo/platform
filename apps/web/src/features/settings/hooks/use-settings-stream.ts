import { settingsSnapshotSchema, type SettingsSnapshot } from '@workspace/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import * as v from 'valibot'

import { getClient } from '@/lib/client'
import { parseEdenSseStream } from '@/lib/eden-events'

import { settingsKeys } from '@/features/settings/utils/query-keys'

/**
 * Keeps this tab's settings in step with the file on disk.
 *
 * The settings file is the source of truth in both directions, so a hand-edit,
 * another window, and this tab's own save all arrive the same way. It also
 * replaces something that used to work by accident: theme was synced across
 * tabs by a `storage` listener, and moving it to a server document would have
 * quietly deleted that. `refetchOnWindowFocus` is not a substitute — it never
 * fires for a second window that is visible but not focused, which is exactly
 * the desktop-window-plus-browser-tab setup.
 *
 * The server suppresses the echo of its own writes, so a snapshot arriving here
 * is always news.
 */
export function useSettingsStream() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const controller = new AbortController()

    void streamSettings(controller.signal, (snapshot) => {
      queryClient.setQueryData(settingsKeys.document(), snapshot)
    })

    return () => controller.abort()
  }, [queryClient])
}

async function streamSettings(signal: AbortSignal, onSnapshot: (next: SettingsSnapshot) => void) {
  try {
    const response = await getClient().settings.events.get({ fetch: { signal } })
    if (response.error || !response.data) return

    for await (const event of parseEdenSseStream(response.data)) {
      const parsed = v.safeParse(settingsSnapshotSchema, event.data)
      if (!parsed.success) continue

      onSnapshot(parsed.output)
    }
  } catch {
    // A dropped stream is not a settings failure: the query still holds the last
    // snapshot, and a reload re-subscribes. Surfacing it would put an error in
    // front of a user whose settings are working.
  }
}
