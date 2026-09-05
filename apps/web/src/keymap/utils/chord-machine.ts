import { isModifierKey, normalizeKeyName } from '@tanstack/hotkeys'

import type { KeyBindingKeyboardEvent, ParsedPlatformKeyBinding } from '@/keymap/types'
import { CHORD_TIMEOUT_MS } from '@/keymap/utils/chord'
import { trieStep, type KeymapNode, type KeymapTrie } from '@/keymap/utils/keymap-trie'

export type ChordOutcome =
  | 'completed'
  | 'unmatched'
  | 'timeout'
  | 'blur'
  | 'hidden'
  | 'pointer'
  | 'superseded'

export type PendingChord = {
  readonly matched: readonly [string, ...string[]]
  readonly node: KeymapNode
  readonly armedAt: number
}

export type PendingChordLabel = {
  readonly keys: string
  readonly candidateCount: number
}

export type ChordAction =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'swallow' }
  | { readonly kind: 'arm'; readonly pending: PendingChord }
  | {
      readonly kind: 'run'
      readonly binding: ParsedPlatformKeyBinding
      readonly fromChord: boolean
    }
  | { readonly kind: 'cancel'; readonly outcome: ChordOutcome }

export function chordTransition(
  trie: KeymapTrie,
  pending: PendingChord | null,
  event: KeyBindingKeyboardEvent,
  targetsTextEntry: boolean,
  now: number,
): ChordAction {
  if (event.isComposing || event.keyCode === 229) return { kind: 'ignore' }
  if (isModifierKey(normalizeKeyName(event.key))) {
    return { kind: pending ? 'swallow' : 'ignore' }
  }
  if (!pending) return startChord(trie, event, targetsTextEntry, now)
  if (event.repeat) return { kind: 'swallow' }
  if (now - pending.armedAt >= CHORD_TIMEOUT_MS) return { kind: 'cancel', outcome: 'timeout' }

  const step = trieStep(pending.node, event)
  if (step.kind === 'miss') return { kind: 'cancel', outcome: 'unmatched' }
  if (step.kind === 'run') return { binding: step.binding, fromChord: true, kind: 'run' }

  return {
    kind: 'arm',
    pending: {
      armedAt: now,
      matched: [...pending.matched, step.keys],
      node: step.node,
    },
  }
}

function startChord(
  trie: KeymapTrie,
  event: KeyBindingKeyboardEvent,
  targetsTextEntry: boolean,
  now: number,
): ChordAction {
  const step = trieStep(trie.root, event)
  if (step.kind === 'miss') return { kind: 'ignore' }
  if (!step.firesWhileTyping && targetsTextEntry) return { kind: 'ignore' }
  if (step.kind === 'run') return { binding: step.binding, fromChord: false, kind: 'run' }
  if (event.repeat) return { kind: 'ignore' }

  return {
    kind: 'arm',
    pending: {
      armedAt: now,
      matched: [step.keys],
      node: step.node,
    },
  }
}
