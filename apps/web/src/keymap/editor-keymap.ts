import {
  defaultEditorCommandPacks,
  editorKeymapLayersForBindings,
  filterEditorKeymapLayersByCommandPacks,
  readonlySafeEditorCommandPacks,
  type EditorCommandId,
  type EditorCommandPack,
  type EditorKeyBinding,
  type EditorKeymapLayer,
} from '@singapor/core'

import type { EditorPlatformCommandId, PlatformCommandId, PlatformKeyBinding } from './types'

const EDITOR_COMMAND_PREFIX = 'editor.'

function editorKeyBindingsFromPlatform(
  bindings: readonly PlatformKeyBinding[],
): readonly EditorKeyBinding[] {
  return bindings.flatMap((binding) => {
    const editorBinding = editorKeyBindingFromPlatform(binding)
    return editorBinding ? [editorBinding] : []
  })
}

export function editorKeyBindingFromPlatform(binding: PlatformKeyBinding): EditorKeyBinding | null {
  const command = editorCommandIdFromPlatform(binding.command)
  if (!command) return null

  return {
    command,
    hotkey: binding.hotkey,
    preventDefault: binding.preventDefault,
    stopPropagation: binding.stopPropagation,
  }
}

export function editorKeymapLayersFromPlatform(
  bindings: readonly PlatformKeyBinding[],
  packs: readonly EditorCommandPack[] = defaultEditorCommandPacks,
): readonly EditorKeymapLayer[] {
  return editorKeymapLayersForBindings(editorKeyBindingsFromPlatform(bindings), packs, {
    idPrefix: 'platform',
    source: 'app',
  })
}

export function readonlyEditorKeymapLayers(
  layers: readonly EditorKeymapLayer[],
): readonly EditorKeymapLayer[] {
  return filterEditorKeymapLayersByCommandPacks(layers, readonlySafeEditorCommandPacks)
}

export function isEditorPlatformCommandId(
  command: PlatformCommandId | null,
): command is EditorPlatformCommandId {
  if (!command) return false

  return command.startsWith(EDITOR_COMMAND_PREFIX)
}

export function editorCommandIdFromPlatform(
  command: PlatformCommandId | null,
): EditorCommandId | null {
  if (!isEditorPlatformCommandId(command)) return null

  return command.slice(EDITOR_COMMAND_PREFIX.length) as EditorCommandId
}
