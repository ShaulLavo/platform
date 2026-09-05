import {
  normalizeKeyName,
  normalizeRegisterableHotkey,
  parseHotkey,
  rawHotkeyToParsedHotkey,
  type ParsedHotkey,
  type RegisterableHotkey,
} from '@tanstack/hotkeys'

import { LATIN_LETTER_PATTERN, physicalKeyName } from '@/keymap/active-bindings'
import type {
  KeyBindingKeyboardEvent,
  ParsedPlatformKeyBinding,
  PlatformKeyBinding,
} from '@/keymap/types'
import type { PlatformName } from '@/keymap/utils/chord'

type StrokeEdge = {
  readonly keys: string
  readonly mods: number
  readonly firesWhileTyping: boolean
  readonly node: KeymapNode
}

export type KeymapNode = {
  readonly next: ReadonlyMap<string, readonly StrokeEdge[]>
  readonly binding: ParsedPlatformKeyBinding | null
  readonly continuations: number
}

export type KeymapTrie = {
  readonly root: KeymapNode
  readonly dropped: readonly PlatformKeyBinding[]
}

export type TrieStep =
  | { readonly kind: 'miss' }
  | {
      readonly kind: 'arm'
      readonly keys: string
      readonly node: KeymapNode
      readonly firesWhileTyping: boolean
    }
  | {
      readonly kind: 'run'
      readonly binding: ParsedPlatformKeyBinding
      readonly firesWhileTyping: boolean
    }

type MutableNode = {
  readonly next: Map<string, MutableEdge[]>
  binding: ParsedPlatformKeyBinding | null
  continuations: number
}

type MutableEdge = Omit<StrokeEdge, 'node'> & { readonly node: MutableNode }

export function buildKeymapTrie(
  bindings: readonly PlatformKeyBinding[],
  platform: PlatformName,
): KeymapTrie {
  const root = emptyNode()
  const dropped: PlatformKeyBinding[] = []
  // Insert complete bindings first so a working key always wins over a swallowing prefix.
  const ordered = bindings.toSorted((a, b) => a.chord.length - b.chord.length)
  for (const binding of ordered) {
    if (insertBinding(root, parsedBinding(binding, platform), platform)) continue
    dropped.push(binding)
  }
  return { dropped, root }
}

export function trieStep(node: KeymapNode, event: KeyBindingKeyboardEvent): TrieStep {
  const mods = modifierMask(event.altKey, event.ctrlKey, event.metaKey, event.shiftKey)
  const printed = normalizeKeyName(event.key)
  const match = matchingEdge(node, printed, mods)
  if (match) return edgeStep(match)
  // Latin layouts own their printed letters; AZERTY's Z must never activate physical W.
  if (LATIN_LETTER_PATTERN.test(printed)) return { kind: 'miss' }

  const physical = physicalKeyName(event.code)
  if (!physical) return { kind: 'miss' }
  const fallback = matchingEdge(node, physical, mods)
  return fallback ? edgeStep(fallback) : { kind: 'miss' }
}

function parsedBinding(
  binding: PlatformKeyBinding,
  platform: PlatformName,
): ParsedPlatformKeyBinding {
  const [first, ...rest] = binding.chord
  const firstStep = parsedStroke(first, platform)
  return {
    binding,
    firesWhileTyping: firstStep.ctrl || firstStep.meta || firstStep.key === 'Escape',
    steps: [firstStep, ...rest.map((stroke) => parsedStroke(stroke, platform))],
  }
}

function parsedStroke(stroke: RegisterableHotkey, platform: PlatformName): ParsedHotkey {
  return typeof stroke === 'string'
    ? parseHotkey(stroke, platform)
    : rawHotkeyToParsedHotkey(stroke, platform)
}

function insertBinding(
  root: MutableNode,
  binding: ParsedPlatformKeyBinding,
  platform: PlatformName,
): boolean {
  let node = root
  const path = [node]
  for (const stroke of binding.steps) {
    if (node.binding) return false
    node = ensureEdge(node, stroke, binding.firesWhileTyping, platform).node
    path.push(node)
  }
  const added = node.binding === null
  node.binding = binding
  if (added) incrementContinuations(path)
  return true
}

function ensureEdge(
  node: MutableNode,
  stroke: ParsedHotkey,
  firesWhileTyping: boolean,
  platform: PlatformName,
): MutableEdge {
  const mods = modifierMask(stroke.alt, stroke.ctrl, stroke.meta, stroke.shift)
  const edges = node.next.get(stroke.key) ?? []
  const existing = edges.find((edge) => edge.mods === mods)
  if (existing) return existing
  const edge: MutableEdge = {
    firesWhileTyping,
    keys: normalizeRegisterableHotkey(stroke, platform),
    mods,
    node: emptyNode(),
  }
  edges.push(edge)
  node.next.set(stroke.key, edges)
  return edge
}

function incrementContinuations(path: readonly MutableNode[]) {
  for (const node of path) node.continuations += 1
}

function emptyNode(): MutableNode {
  return { binding: null, continuations: 0, next: new Map() }
}

function matchingEdge(node: KeymapNode, key: string, mods: number): StrokeEdge | null {
  const edges = node.next.get(key)
  if (!edges) return null
  for (const edge of edges) {
    if (edge.mods === mods) return edge
  }
  return null
}

function edgeStep(edge: StrokeEdge): TrieStep {
  const { firesWhileTyping, node } = edge
  if (node.binding) return { binding: node.binding, firesWhileTyping, kind: 'run' }
  return { firesWhileTyping, keys: edge.keys, kind: 'arm', node }
}

function modifierMask(alt: boolean, ctrl: boolean, meta: boolean, shift: boolean): number {
  return (alt ? 1 : 0) | (ctrl ? 2 : 0) | (meta ? 4 : 0) | (shift ? 8 : 0)
}
