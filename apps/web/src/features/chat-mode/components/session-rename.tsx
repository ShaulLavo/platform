import type { KeyboardEvent } from 'react'

import { useSessionActions } from '@/features/chat-mode/hooks/use-session-actions'
import { useSessionRail } from '@/features/chat-mode/providers/rail-context'
import type { SessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import { Input } from '@workspace/ui/components/input'

/**
 * Takes the row's place while a session is being renamed. Enter and blur commit,
 * Escape restores the original title — an unmount can fire a trailing blur, and
 * restoring first makes that blur a no-op instead of a stealth commit.
 */
export function SessionRename({ session }: { readonly session: SessionRailItem }) {
  const { endRename } = useSessionRail()
  const { rename } = useSessionActions()

  function commit(value: string) {
    const title = value.trim()
    endRename()
    // The server rejects blank titles, and an unchanged one is not an edit.
    if (!title) return
    if (title === session.title) return

    rename(session.id, title)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit(event.currentTarget.value)
      return
    }
    if (event.key !== 'Escape') return

    event.preventDefault()
    event.currentTarget.value = session.title
    endRename()
  }

  return (
    <Input
      aria-label='Session title'
      autoFocus
      className='bg-accent text-foreground h-auto rounded-md border-transparent px-2 py-1.5 text-[13px] leading-5'
      defaultValue={session.title}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
    />
  )
}
