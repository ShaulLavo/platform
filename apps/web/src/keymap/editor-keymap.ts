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

import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'

const EDITOR_COMMAND_PREFIX = 'editor.'
type EditorAdapterPlatformCommandId = `editor.${EditorCommandId}`

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
  // Editor layers accept one stroke; passing a chord would steal its final key.
  if (binding.chord.length !== 1) return null

  return {
    command,
    hotkey: binding.chord[0],
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
  command: EditorAdapterPlatformCommandId | PlatformCommandId | null,
): command is EditorAdapterPlatformCommandId {
  if (!command) return false

  return command.startsWith(EDITOR_COMMAND_PREFIX)
}

export function editorCommandIdFromPlatform(
  command: EditorAdapterPlatformCommandId | PlatformCommandId | null,
): EditorCommandId | null {
  if (!isEditorPlatformCommandId(command)) return null

  return command.slice(EDITOR_COMMAND_PREFIX.length) as EditorCommandId
}
