import { useEffect, useMemo } from 'react'
import { detectPlatform } from '@tanstack/react-hotkeys'

import type { PlatformCommandBus } from '@/keymap/providers/command-context'
import type { FocusArea } from '@/lib/focus/state/service'

import {
  activePlatformKeyBindings,
  parsedPlatformKeyBindings,
  platformKeyBindingForKeyboardEvent,
} from './active-bindings'
import { isEditorPlatformCommandId } from './editor-keymap'
import type { ParsedPlatformKeyBinding, PlatformKeyBinding } from './types'

type PlatformName = ReturnType<typeof detectPlatform>

const NON_TEXT_INPUT_TYPES = new Set(['button', 'reset', 'submit'])

/**
 * Runs `bindings` as the document keymap. The table arrives already resolved
 * against the user's overrides: the hook must not fold them in privately, or
 * the surfaces that print shortcut hints from the same table would print a key
 * this listener no longer answers to.
 */
export function useAppKeymap({
  bindings,
  bus,
  focusedPane,
}: {
  readonly bindings: readonly PlatformKeyBinding[]
  readonly bus: PlatformCommandBus
  readonly focusedPane: FocusArea
}) {
  const platform = detectPlatform()
  // Stable identity: the listener effect below re-subscribes on every change.
  const activeBindings = useMemo(
    () => appHotkeyBindings(bindings, focusedPane, platform),
    [bindings, focusedPane, platform],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => runAppKeymap(activeBindings, bus, event)
    document.addEventListener('keydown', onKeyDown)

    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeBindings, bus])
}

export function appKeyBindingsForPane(
  bindings: readonly PlatformKeyBinding[],
  focusedPane: FocusArea,
): readonly PlatformKeyBinding[] {
  return activePlatformKeyBindings(bindings, focusedPane).filter(isAppKeyBinding)
}

function appHotkeyBindings(
  bindings: readonly PlatformKeyBinding[],
  focusedPane: FocusArea,
  platform: PlatformName,
) {
  return parsedPlatformKeyBindings(appKeyBindingsForPane(bindings, focusedPane), platform)
}

function isAppKeyBinding(binding: PlatformKeyBinding) {
  return !isEditorPlatformCommandId(binding.command)
}

function runAppKeymap(
  bindings: readonly ParsedPlatformKeyBinding[],
  bus: PlatformCommandBus,
  event: KeyboardEvent,
) {
  const match = platformKeyBindingForKeyboardEvent(bindings, event)
  if (!match) return
  if (!match.firesWhileTyping && eventTargetsTextEntry(event)) return

  const { binding } = match
  // Reserved chords protect browser-owned keys even though no command runs.
  if (!binding.command) {
    suppressEvent(binding, event)
    return
  }

  const ticket = bus.dispatch(binding.command, {
    event,
    source: { kind: 'keybinding' },
  })
  if (!ticket.claimed) return

  suppressEvent(binding, event)
}

function suppressEvent(binding: ParsedPlatformKeyBinding['binding'], event: KeyboardEvent) {
  if (binding.preventDefault !== false) event.preventDefault()
  if (binding.stopPropagation !== false) event.stopPropagation()
}

/**
 * The composed path matters for shadow-DOM fields: document listeners see the
 * host as both the active element and retargeted event target.
 */
function eventTargetsTextEntry(event: KeyboardEvent) {
  if (isTextEntryElement(document.activeElement)) return true
  if (isTextEntryElement(event.target)) return true

  return event.composedPath().some((target) => isTextEntryElement(target ?? null))
}

function isTextEntryElement(target: EventTarget | null) {
  if (target instanceof HTMLInputElement)
    return !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase())
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLSelectElement) return true

  return target instanceof HTMLElement && target.isContentEditable
}
