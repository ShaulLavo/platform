import { hotkeyPresetId } from './layout-ids'
import {
  CLOSE_ACTIVE_SURFACE_COMMAND_ID,
  MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID,
  MINIMIZE_ACTIVE_SURFACE_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
  MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID,
  RESTORE_ACTIVE_WINDOW_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID,
  SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID,
} from './layout-command-catalog'
import type { HotkeyPresetId, WindowManagementHotkeyPreset } from './layout-types'

export const PLATFORM_HOTKEY_PRESET_ID = hotkeyPresetId('platform')
export const VSCODE_HOTKEY_PRESET_ID = hotkeyPresetId('vscode')
export const HYPRLAND_I3_HOTKEY_PRESET_ID = hotkeyPresetId('hyprland-i3')

export const DEFAULT_HOTKEY_PRESET_ID: HotkeyPresetId = PLATFORM_HOTKEY_PRESET_ID

export const DEFAULT_WINDOW_MANAGEMENT_HOTKEY_PRESETS = [
  {
    bindings: {
      [CLOSE_ACTIVE_SURFACE_COMMAND_ID]: 'Alt+Shift+W',
      [MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID]: 'Alt+Shift+M',
      [MINIMIZE_ACTIVE_SURFACE_COMMAND_ID]: 'Alt+Shift+H',
      [MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID]: 'Alt+Shift+ArrowDown',
      [MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID]: 'Alt+Shift+ArrowLeft',
      [MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID]: 'Alt+Shift+ArrowRight',
      [MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID]: 'Alt+Shift+ArrowUp',
      [RESTORE_ACTIVE_WINDOW_COMMAND_ID]: 'Alt+Shift+R',
      [SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID]: 'Alt+Shift+J',
      [SPLIT_ACTIVE_WINDOW_LEFT_COMMAND_ID]: 'Alt+Shift+A',
      [SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID]: 'Alt+Shift+D',
      [SPLIT_ACTIVE_WINDOW_TOP_COMMAND_ID]: 'Alt+Shift+K',
    },
    id: PLATFORM_HOTKEY_PRESET_ID,
    source: 'platform',
    title: 'Platform',
  },
  {
    bindings: {
      [CLOSE_ACTIVE_SURFACE_COMMAND_ID]: 'Ctrl+W',
      [MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID]: 'Ctrl+K Ctrl+M',
      [RESTORE_ACTIVE_WINDOW_COMMAND_ID]: 'Ctrl+K Ctrl+R',
      [SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID]: 'Ctrl+\\',
      [SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID]: 'Ctrl+\\',
    },
    id: VSCODE_HOTKEY_PRESET_ID,
    source: 'vscode',
    title: 'VS Code',
  },
  {
    bindings: {
      [CLOSE_ACTIVE_SURFACE_COMMAND_ID]: 'Mod+Shift+Q',
      [MAXIMIZE_ACTIVE_WINDOW_COMMAND_ID]: 'Mod+F',
      [MOVE_ACTIVE_WINDOW_BOTTOM_COMMAND_ID]: 'Mod+Shift+J',
      [MOVE_ACTIVE_WINDOW_LEFT_COMMAND_ID]: 'Mod+Shift+H',
      [MOVE_ACTIVE_WINDOW_RIGHT_COMMAND_ID]: 'Mod+Shift+L',
      [MOVE_ACTIVE_WINDOW_TOP_COMMAND_ID]: 'Mod+Shift+K',
      [SPLIT_ACTIVE_WINDOW_BOTTOM_COMMAND_ID]: 'Mod+V',
      [SPLIT_ACTIVE_WINDOW_RIGHT_COMMAND_ID]: 'Mod+H',
    },
    id: HYPRLAND_I3_HOTKEY_PRESET_ID,
    source: 'hyprland-i3',
    title: 'Hyprland / i3',
  },
] as const satisfies readonly WindowManagementHotkeyPreset[]

export function defaultWindowManagementHotkeyPresets() {
  return DEFAULT_WINDOW_MANAGEMENT_HOTKEY_PRESETS
}

export function defaultHotkeyPresetsById() {
  const presetsById: Record<string, WindowManagementHotkeyPreset> = {}

  for (const preset of DEFAULT_WINDOW_MANAGEMENT_HOTKEY_PRESETS) {
    presetsById[preset.id] = preset
  }

  return presetsById
}
