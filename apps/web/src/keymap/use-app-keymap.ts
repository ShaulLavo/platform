import { useEffect, useMemo } from 'react'
import { detectPlatform } from '@tanstack/react-hotkeys'
import { DEFAULT_SETTINGS, type KeybindingOverrides } from '@workspace/contracts'

import type { FocusArea } from '@/components/workspace/focus/providers/focus-state'
import { useSettings } from '@/features/settings/hooks/use-settings'

import {
  activePlatformKeyBindings,
  parsedPlatformKeyBindings,
  platformKeyBindingForKeyboardEvent,
  resolvedPlatformKeyBindings,
} from './active-bindings'
import { isEditorPlatformCommandId } from './editor-keymap'
import type { ParsedPlatformKeyBinding, PlatformCommandId, PlatformKeyBinding } from './types'

type PlatformName = ReturnType<typeof detectPlatform>

const NON_TEXT_INPUT_TYPES = new Set(['button', 'reset', 'submit'])

export type PlatformCommandDispatch = (
  command: PlatformCommandId,
  event?: KeyboardEvent,
) => boolean | void

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
  // The keymap is the settings document's always-mounted reader: overrides
  // arrive on the same query the settings panel writes through, so a save lands
  // on the key table without a reload.
  const overrides = useSettings().data?.keybindings ?? DEFAULT_SETTINGS.keybindings
  const activeBindings = useMemo(
    () => appHotkeyBindings(bindings, overrides, focusedPane, platform),
    [bindings, focusedPane, overrides, platform],
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
  overrides: KeybindingOverrides,
  focusedPane: FocusArea,
  platform: PlatformName,
) {
  const resolved = resolvedPlatformKeyBindings(bindings, overrides, platform)

  return parsedPlatformKeyBindings(appKeyBindingsForPane(resolved, focusedPane), platform)
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
