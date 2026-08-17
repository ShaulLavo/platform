import { useEffect, useMemo } from 'react'
import { detectPlatform } from '@tanstack/react-hotkeys'

import type { FocusArea } from '@/features/workspace/providers/focus-state'

import {
  activePlatformKeyBindings,
  parsedPlatformKeyBindings,
  platformKeyBindingForKeyboardEvent,
} from './active-bindings'
import { isEditorPlatformCommandId } from './editor-keymap'
import type { ParsedPlatformKeyBinding, PlatformCommandId, PlatformKeyBinding } from './types'

type PlatformName = ReturnType<typeof detectPlatform>

const NON_TEXT_INPUT_TYPES = new Set(['button', 'reset', 'submit'])

export type PlatformCommandDispatch = (
  command: PlatformCommandId,
  event?: KeyboardEvent,
) => boolean | void

/**
 * Runs `bindings` as the document keymap. The table arrives already resolved
 * against the user's overrides: the hook must not fold them in privately, or
 * the surfaces that print shortcut hints from the same table would print a key
 * this listener no longer answers to.
 */
export function useAppKeymap({
  bindings,
  dispatch,
  focusedPane,
}: {
  readonly bindings: readonly PlatformKeyBinding[]
  readonly dispatch: PlatformCommandDispatch
  readonly focusedPane: FocusArea
}) {
  const platform = detectPlatform()
  // Stable identity: the listener effect below re-subscribes on every change.
  const activeBindings = useMemo(
    () => appHotkeyBindings(bindings, focusedPane, platform),
    [bindings, focusedPane, platform],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => runAppKeymap(activeBindings, dispatch, event)
    document.addEventListener('keydown', onKeyDown)

    return () => document.removeEventListener('keydown', onKeyDown)
  }, [activeBindings, dispatch])
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
  dispatch: PlatformCommandDispatch,
  event: KeyboardEvent,
) {
  const match = platformKeyBindingForKeyboardEvent(bindings, event)
  if (!match) return
  if (!match.firesWhileTyping && eventTargetsTextEntry(event)) return

  const { binding } = match
  if (binding.preventDefault !== false) event.preventDefault()
  if (binding.stopPropagation !== false) event.stopPropagation()
  // A no-op binding exists to keep the browser off a key we do not implement
  // yet, so it swallows the event and dispatches nothing.
  if (!binding.command) return

  dispatch(binding.command, event)
}

/**
 * `document.activeElement` is checked alongside the event target because a key
 * pressed while a scroll container has the event still belongs to whichever
 * field holds the caret.
 */
function eventTargetsTextEntry(event: KeyboardEvent) {
  if (isTextEntryElement(document.activeElement)) return true

  return isTextEntryElement(event.target)
}

function isTextEntryElement(target: EventTarget | null) {
  if (target instanceof HTMLInputElement)
    return !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase())
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLSelectElement) return true

  return target instanceof HTMLElement && target.isContentEditable
}
