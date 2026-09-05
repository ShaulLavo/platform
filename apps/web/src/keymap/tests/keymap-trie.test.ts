import { expect, test } from '../../../test/fixtures'
import { binding } from '../../../test/factories/key-binding'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { activePlatformKeyBindings } from '@/keymap/active-bindings'
import type { KeyBindingKeyboardEvent, PlatformKeyBinding } from '@/keymap/types'
import { buildKeymapTrie, trieStep, type KeymapNode } from '@/keymap/utils/keymap-trie'

const prefix = keyEvent('k', 'KeyK')

test.each([false, true])(
  'the complete binding wins a prefix collision regardless of order (%s)',
  (reversed) => {
    const complete = binding('Mod+K')
    const chord = binding('Mod+K Mod+S')
    const bindings = reversed ? [chord, complete] : [complete, chord]
    const trie = buildKeymapTrie(bindings, 'linux')
    expect(trie.dropped).toEqual([chord])
    expect(trieStep(trie.root, prefix)).toMatchObject({
      binding: { binding: complete },
      kind: 'run',
    })
    expectNodeInvariant(trie.root)
  },
)

test.each(['mac', 'linux', 'windows'] as const)(
  'every default trie node on %s is a complete binding or a prefix',
  (platform) => {
    const trie = buildKeymapTrie(
      activePlatformKeyBindings(defaultPlatformKeyBindings(platform), 'editor'),
      platform,
    )
    expect(trie.dropped).toEqual([])
    expectNodeInvariant(trie.root)
  },
)

test('two bindings share one prefix and retain their independent completions', () => {
  const save = binding('Mod+K Mod+S')
  const panel = binding('Mod+K Mod+B', { command: 'workspace.togglePanel' })
  const trie = buildKeymapTrie([save, panel], 'linux')
  const step = trieStep(trie.root, prefix)
  expect(step.kind).toBe('arm')
  if (step.kind !== 'arm') return
  expect(step.keys).toBe('Mod+K')
  expect(step.node.continuations).toBe(2)
  expect(trieStep(step.node, keyEvent('s', 'KeyS'))).toMatchObject({
    binding: { binding: save },
    kind: 'run',
  })
  expect(trieStep(step.node, keyEvent('b', 'KeyB'))).toMatchObject({
    binding: { binding: panel },
    kind: 'run',
  })
})

test.each([
  ['и', 'KeyB', true],
  ['ד', 'KeyB', true],
  ['z', 'KeyB', false],
  ['Dead', 'KeyB', true],
] as const)('continuation %s uses the same layout policy as its prefix', (key, code, matches) => {
  const trie = buildKeymapTrie([binding('Mod+K Mod+B')], 'linux')
  const step = trieStep(trie.root, prefix)
  expect(step.kind).toBe('arm')
  if (step.kind !== 'arm') return
  expect(trieStep(step.node, keyEvent(key, code)).kind).toBe(matches ? 'run' : 'miss')
})

test('the matching physical prefix supplies its canonical label', () => {
  const trie = buildKeymapTrie([binding('Mod+K Mod+B')], 'linux')
  expect(trieStep(trie.root, keyEvent('л', 'KeyK'))).toMatchObject({ keys: 'Mod+K', kind: 'arm' })
})

test('modifier masks distinguish shifted and unshifted completions', () => {
  const trie = buildKeymapTrie([binding('Mod+K Mod+S')], 'linux')
  const step = trieStep(trie.root, prefix)
  expect(step.kind).toBe('arm')
  if (step.kind !== 'arm') return
  expect(trieStep(step.node, { ...keyEvent('s', 'KeyS'), shiftKey: true }).kind).toBe('miss')
  expect(trieStep(step.node, keyEvent('s', 'KeyS')).kind).toBe('run')
})

test('the trie supports deeper authored tuples without weakening the settings depth cap', () => {
  const deep: PlatformKeyBinding = {
    ...binding('Mod+K Mod+S'),
    chord: ['Mod+K', 'Mod+S', 'X'],
    keys: 'Mod+K Mod+S X',
  }
  const trie = buildKeymapTrie([deep], 'linux')
  const first = trieStep(trie.root, prefix)
  expect(first.kind).toBe('arm')
  if (first.kind !== 'arm') return
  const second = trieStep(first.node, keyEvent('s', 'KeyS'))
  expect(second.kind).toBe('arm')
  if (second.kind !== 'arm') return
  expect(trieStep(second.node, { ...keyEvent('x', 'KeyX'), ctrlKey: false })).toMatchObject({
    kind: 'run',
  })
})

function expectNodeInvariant(node: KeymapNode) {
  expect(Number(node.binding !== null) + Number(node.next.size > 0)).toBe(1)
  for (const edges of node.next.values()) {
    for (const edge of edges) expectNodeInvariant(edge.node)
  }
}

function keyEvent(key: string, code: string): KeyBindingKeyboardEvent {
  return { altKey: false, code, ctrlKey: true, key, metaKey: false, shiftKey: false }
}
