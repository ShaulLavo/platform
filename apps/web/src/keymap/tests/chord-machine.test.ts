import { binding } from '../../../test/factories/key-binding'
import { expect, test } from '../../../test/fixtures'

import type { KeyBindingKeyboardEvent } from '@/keymap/types'
import { CHORD_TIMEOUT_MS } from '@/keymap/utils/chord'
import { chordTransition } from '@/keymap/utils/chord-machine'
import { buildKeymapTrie } from '@/keymap/utils/keymap-trie'

const trie = buildKeymapTrie([binding('Mod+K Mod+S'), binding('Mod+S'), binding('F1')], 'linux')

test('arms without dispatch, then completes one matching binding', () => {
  const action = chordTransition(trie, null, key('k'), true, 0)
  expect(action.kind).toBe('arm')
  if (action.kind !== 'arm') return

  expect(action.pending.matched).toEqual(['Mod+K'])
  expect(chordTransition(trie, action.pending, key('s'), true, 10)).toMatchObject({
    binding: { binding: { keys: 'Mod+K Mod+S' } },
    fromChord: true,
    kind: 'run',
  })
})

test('unmatched strokes and Escape cancel without falling through to a single binding', () => {
  const action = chordTransition(trie, null, key('k'), false, 0)
  if (action.kind !== 'arm') return expect.unreachable('Expected prefix to arm')

  expect(chordTransition(trie, action.pending, key('F1', { ctrlKey: false }), false, 10)).toEqual({
    kind: 'cancel',
    outcome: 'unmatched',
  })
  expect(
    chordTransition(trie, action.pending, key('Escape', { ctrlKey: false }), false, 10),
  ).toEqual({ kind: 'cancel', outcome: 'unmatched' })
})

test('modifier keys and repeated prefixes preserve the original pending state', () => {
  const action = chordTransition(trie, null, key('k'), false, 0)
  if (action.kind !== 'arm') return expect.unreachable('Expected prefix to arm')

  expect(chordTransition(trie, action.pending, key('Control'), false, 10)).toEqual({
    kind: 'swallow',
  })
  expect(chordTransition(trie, action.pending, key('k', { repeat: true }), false, 20)).toEqual({
    kind: 'swallow',
  })
  expect(action.pending.armedAt).toBe(0)
  expect(chordTransition(trie, null, key('k', { repeat: true }), false, 20)).toEqual({
    kind: 'ignore',
  })
  expect(chordTransition(trie, null, key('s', { repeat: true }), false, 20)).toMatchObject({
    kind: 'run',
    fromChord: false,
  })
})

test('IME events are ignored before and during a chord, including the initial 229 event', () => {
  const action = chordTransition(trie, null, key('k'), false, 0)
  if (action.kind !== 'arm') return expect.unreachable('Expected prefix to arm')

  for (const extra of [{ isComposing: true }, { isComposing: false, keyCode: 229 }]) {
    expect(chordTransition(trie, null, key('k', extra), false, 10)).toEqual({ kind: 'ignore' })
    expect(chordTransition(trie, action.pending, key('s', extra), false, 10)).toEqual({
      kind: 'ignore',
    })
  }
})

test('expires at the timeout boundary and gates typing only on the first stroke', () => {
  const action = chordTransition(trie, null, key('k'), true, 0)
  if (action.kind !== 'arm') return expect.unreachable('Expected prefix to arm')

  expect(chordTransition(trie, action.pending, key('s'), false, CHORD_TIMEOUT_MS)).toEqual({
    kind: 'cancel',
    outcome: 'timeout',
  })
  expect(chordTransition(trie, null, key('F1', { ctrlKey: false }), true, 0)).toEqual({
    kind: 'ignore',
  })
})

test('the trie can advance beyond the recorder and contract depth cap', () => {
  const deeper = buildKeymapTrie(
    [
      {
        ...binding('Mod+K Mod+S'),
        chord: ['Mod+K', 'Mod+S', 'Mod+X'],
        keys: 'Mod+K Mod+S Mod+X',
      },
    ],
    'linux',
  )
  const first = chordTransition(deeper, null, key('k'), false, 0)
  if (first.kind !== 'arm') return expect.unreachable('Expected prefix to arm')

  expect(chordTransition(deeper, first.pending, key('s'), false, 10)).toMatchObject({
    kind: 'arm',
    pending: { armedAt: 10, matched: ['Mod+K', 'Mod+S'] },
  })
})

function key(value: string, extra: Partial<KeyBindingKeyboardEvent> = {}): KeyBindingKeyboardEvent {
  return { altKey: false, ctrlKey: true, key: value, metaKey: false, shiftKey: false, ...extra }
}
