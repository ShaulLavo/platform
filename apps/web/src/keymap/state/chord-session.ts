import type { PlatformCommandBus } from '@/keymap/providers/command-context'
import type { ParsedPlatformKeyBinding } from '@/keymap/types'
import { CHORD_TIMEOUT_MS } from '@/keymap/utils/chord'
import {
  chordTransition,
  type ChordAction,
  type ChordOutcome,
  type PendingChord,
  type PendingChordLabel,
} from '@/keymap/utils/chord-machine'
import { eventTargetsTextEntry } from '@/keymap/utils/keyboard-event'
import type { KeymapTrie } from '@/keymap/utils/keymap-trie'
import type { FocusArea, FocusService, FocusTargetToken } from '@/lib/focus/state/service'
import { createWideEventScope, type WideEventScope } from '@/lib/wide-event-scope'

type SessionConfiguration = {
  readonly bus: Pick<PlatformCommandBus, 'dispatch'>
  readonly focus?: FocusService
  readonly focusedPane: FocusArea
  readonly focusedTarget?: FocusTargetToken | null
  readonly onPendingChange: (pending: PendingChordLabel | null) => void
  readonly trie: KeymapTrie
}

type KeyOwnership = 'binding' | 'chord'

export function createChordSession(initial: SessionConfiguration) {
  let config = initial
  let pending: PendingChord | null = null
  let armedTarget: FocusTargetToken | null = null
  let scope: WideEventScope | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribeFocus: (() => void) | undefined
  let mounted = false
  const processed = new WeakMap<KeyboardEvent, boolean>()
  const claimedKeys = new Map<string, KeyOwnership>()

  function syncCapture() {
    if (pending || hasClaimedChordKey()) {
      document.addEventListener('keydown', onArmedCapture, true)
      return
    }

    document.removeEventListener('keydown', onArmedCapture, true)
  }

  function hasClaimedChordKey() {
    for (const ownership of claimedKeys.values()) {
      if (ownership === 'chord') return true
    }
    return false
  }

  function disarm(outcome: ChordOutcome, binding?: ParsedPlatformKeyBinding) {
    if (!pending) return

    clearTimeout(timer)
    scope?.end({
      command: binding?.binding.command ?? null,
      elapsedMs: Date.now() - pending.armedAt,
      keys: binding?.binding.keys ?? pending.matched.join(' '),
      outcome,
      strokeCount: binding?.binding.chord.length ?? pending.matched.length,
    })
    pending = null
    scope = null
    syncCapture()
    config.onPendingChange(null)
  }

  function arm(next: PendingChord) {
    scope ??= createWideEventScope({ action: 'keymap.chord', area: 'command' })
    scope.set({
      candidateCount: next.node.continuations,
      pane: config.focusedPane,
      prefix: next.matched[0],
    })
    pending = next
    armedTarget = currentTarget()
    clearTimeout(timer)
    timer = setTimeout(() => disarm('timeout'), CHORD_TIMEOUT_MS)
    // Install synchronously: the next key may arrive before React renders the label.
    syncCapture()
    config.onPendingChange({
      candidateCount: next.node.continuations,
      keys: next.matched.join(' '),
    })
  }

  function applyAction(action: ChordAction, event: KeyboardEvent): KeyOwnership | null {
    switch (action.kind) {
      case 'ignore':
        return null
      case 'swallow':
        swallow(event)
        return 'chord'
      case 'arm':
        event.preventDefault()
        event.stopPropagation()
        if (pending) event.stopImmediatePropagation()
        arm(action.pending)
        return 'chord'
      case 'cancel':
        swallow(event)
        disarm(action.outcome)
        return 'chord'
      case 'run':
        return runBinding(action.binding, event, action.fromChord)
      default:
        const exhaustive: never = action
        return exhaustive
    }
  }

  function runBinding(
    parsed: ParsedPlatformKeyBinding,
    event: KeyboardEvent,
    fromChord: boolean,
  ): KeyOwnership | null {
    if (fromChord) {
      swallow(event)
      disarm('completed', parsed)
    }

    const binding = parsed.binding
    const claimed = binding.command
      ? config.bus.dispatch(binding.command, { event, source: { kind: 'keybinding' } }).claimed
      : true
    if (!claimed) return fromChord ? 'chord' : null
    if (binding.preventDefault !== false) event.preventDefault()
    if (binding.stopPropagation !== false) event.stopPropagation()

    return fromChord ? 'chord' : 'binding'
  }

  function claimKeybinding(event: KeyboardEvent): boolean {
    const prior = processed.get(event)
    if (prior !== undefined) return prior
    const code = event.code || event.key
    if (event.type === 'keyup') {
      const claimed = claimedKeys.delete(code)
      if (claimed) swallow(event)
      syncCapture()
      processed.set(event, claimed)
      return claimed
    }
    if (!event.repeat) claimedKeys.delete(code)
    const previousOwner = claimedKeys.get(code)
    const composing = event.isComposing || event.keyCode === 229
    if (event.repeat && previousOwner === 'chord' && !composing) {
      swallow(event)
      processed.set(event, true)
      return true
    }

    const action = chordTransition(
      config.trie,
      pending,
      event,
      eventTargetsTextEntry(event),
      Date.now(),
    )
    let ownership = applyAction(action, event)
    // A consumed key stays ours until release, even if its chord expires while held.
    if (!ownership && event.repeat && previousOwner && !composing) {
      swallow(event)
      ownership = previousOwner
    }
    if (ownership) claimedKeys.set(code, ownership)
    syncCapture()
    const claimed = ownership !== null
    processed.set(event, claimed)
    return claimed
  }

  function onArmedCapture(event: KeyboardEvent) {
    const ownsRepeat = event.repeat && claimedKeys.get(event.code || event.key) === 'chord'
    if (pending || ownsRepeat) claimKeybinding(event)
  }

  function onKeyDown(event: KeyboardEvent) {
    claimKeybinding(event)
  }

  function onKeyUp(event: KeyboardEvent) {
    claimKeybinding(event)
  }

  function onBlur() {
    claimedKeys.clear()
    disarm('blur')
    syncCapture()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') onHidden()
  }

  function onHidden() {
    claimedKeys.clear()
    disarm('hidden')
    syncCapture()
  }

  function onPointerDown() {
    disarm('pointer')
  }

  function onFocusChange() {
    if (pending && currentTarget() !== armedTarget) disarm('superseded')
  }

  function currentTarget() {
    if (config.focus) return config.focus.getSnapshot().currentOwner?.token ?? null

    return config.focusedTarget ?? null
  }

  function update(next: SessionConfiguration) {
    const changed =
      next.bus !== config.bus ||
      next.trie !== config.trie ||
      next.focusedPane !== config.focusedPane ||
      next.focusedTarget !== config.focusedTarget ||
      next.focus !== config.focus
    if (changed) disarm('superseded')
    const focusChanged = next.focus !== config.focus
    config = next
    if (!focusChanged || !mounted) return

    unsubscribeFocus?.()
    unsubscribeFocus = config.focus?.subscribe(onFocusChange)
  }

  function mount() {
    mounted = true
    unsubscribeFocus = config.focus?.subscribe(onFocusChange)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp, true)
    document.addEventListener('visibilitychange', onVisibilityChange)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onBlur)
    return dispose
  }

  function dispose() {
    mounted = false
    unsubscribeFocus?.()
    disarm('superseded')
    claimedKeys.clear()
    syncCapture()
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('keyup', onKeyUp, true)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    document.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('blur', onBlur)
  }

  return { claimKeybinding, mount, update }
}

function swallow(event: KeyboardEvent) {
  event.preventDefault()
  event.stopImmediatePropagation()
}
