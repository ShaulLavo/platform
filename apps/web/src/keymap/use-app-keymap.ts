import { useLayoutEffect, useMemo, useState } from 'react'
import { detectPlatform } from '@tanstack/react-hotkeys'

import type { PlatformCommandBus } from '@/keymap/providers/command-context'
import { createChordSession } from '@/keymap/state/chord-session'
import type { PlatformKeyBinding } from '@/keymap/types'
import { appKeyBindingsForPane } from '@/keymap/utils/app-bindings'
import type { PendingChordLabel } from '@/keymap/utils/chord-machine'
import { buildKeymapTrie } from '@/keymap/utils/keymap-trie'
import type { FocusArea, FocusService, FocusTargetToken } from '@/lib/focus/state/service'
import { createWideEventScope } from '@/lib/wide-event-scope'

export function useAppKeymap({
  bindings,
  bus,
  focus,
  focusedPane,
  focusedTarget = null,
}: {
  readonly bindings: readonly PlatformKeyBinding[]
  readonly bus: Pick<PlatformCommandBus, 'dispatch'>
  readonly focus?: FocusService
  readonly focusedPane: FocusArea
  readonly focusedTarget?: FocusTargetToken | null
}) {
  const platform = detectPlatform()
  const [pendingChord, setPendingChord] = useState<PendingChordLabel | null>(null)
  // Stable trie/session identity keeps typing and indicator renders from cancelling a chord.
  const trie = useMemo(
    () => buildKeymapTrie(appKeyBindingsForPane(bindings, focusedPane), platform),
    [bindings, focusedPane, platform],
  )
  // Key ownership must survive focus/table changes until the corresponding keyup.
  const [session] = useState(() =>
    createChordSession({
      bus,
      focus,
      focusedPane,
      focusedTarget,
      onPendingChange: setPendingChord,
      trie,
    }),
  )

  useLayoutEffect(() => {
    session.update({
      bus,
      focus,
      focusedPane,
      focusedTarget,
      onPendingChange: setPendingChord,
      trie,
    })
  }, [bus, focus, focusedPane, focusedTarget, session, trie])
  useLayoutEffect(() => session.mount(), [session])
  useLayoutEffect(() => {
    if (trie.dropped.length === 0) return

    const scope = createWideEventScope({ action: 'keymap.prefix-conflict', area: 'command' })
    scope.warn('Shorter bindings shadow chord prefixes', {
      dropped: trie.dropped.map(({ command, keys }) => ({ command, keys })),
      pane: focusedPane,
    })
    scope.end()
  }, [focusedPane, trie])

  return { claimKeybinding: session.claimKeybinding, pendingChord }
}
