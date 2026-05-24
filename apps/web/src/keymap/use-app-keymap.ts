import { useMemo } from 'react'
import {
  useHotkeys,
  type UseHotkeyDefinition,
  type UseHotkeyOptions,
} from '@tanstack/react-hotkeys'

import type { WorkspaceFocusArea } from '@/components/workspace/workspace-focus-state'

import { activePlatformKeyBindings } from './active-bindings'
import { isEditorPlatformCommandId } from './editor-keymap'
import type { PlatformCommandId, PlatformKeyBinding } from './types'

const APP_HOTKEY_OPTIONS = {
  conflictBehavior: 'replace',
  eventType: 'keydown',
} satisfies UseHotkeyOptions

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
  readonly focusedPane: WorkspaceFocusArea
}) {
  const activeBindings = useMemo(
    () => appKeyBindingsForPane(bindings, focusedPane),
    [bindings, focusedPane],
  )
  const definitions = useMemo(
    () => appHotkeyDefinitions(activeBindings, dispatch),
    [activeBindings, dispatch],
  )

  useHotkeys(definitions, APP_HOTKEY_OPTIONS)
}

export function appKeyBindingsForPane(
  bindings: readonly PlatformKeyBinding[],
  focusedPane: WorkspaceFocusArea,
): readonly PlatformKeyBinding[] {
  return activePlatformKeyBindings(bindings, focusedPane).filter(isAppKeyBinding)
}

function isAppKeyBinding(binding: PlatformKeyBinding) {
  return !isEditorPlatformCommandId(binding.command)
}

function appHotkeyDefinitions(
  bindings: readonly PlatformKeyBinding[],
  dispatch: PlatformCommandDispatch,
): UseHotkeyDefinition[] {
  return bindings.map((binding) => ({
    callback: (event) => {
      if (!binding.command) return

      dispatch(binding.command, event)
    },
    hotkey: binding.hotkey,
    options: hotkeyOptions(binding),
  }))
}

function hotkeyOptions(binding: PlatformKeyBinding): UseHotkeyOptions {
  const options: UseHotkeyOptions = {}
  if (binding.meta) options.meta = binding.meta
  if (binding.preventDefault !== undefined) {
    options.preventDefault = binding.preventDefault
  }
  if (binding.stopPropagation !== undefined) {
    options.stopPropagation = binding.stopPropagation
  }

  return options
}
