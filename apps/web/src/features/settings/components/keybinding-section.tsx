import type { KeybindingOverrides } from '@workspace/contracts'

import { commandKeyBindings } from '@/keymap/active-bindings'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import { isEditorPlatformCommandId } from '@/keymap/editor-keymap'

import { KeybindingRow } from './keybinding-row'
import { Section } from './section'

/**
 * Editor commands are left out: the editor builds its keymap from the defaults
 * when the workbench mounts, so an override listed here would look like it took
 * effect without doing anything.
 */
export function KeybindingSection({ overrides }: { overrides: KeybindingOverrides }) {
  const rows = commandKeyBindings(defaultPlatformKeyBindings(), overrides).filter(
    (row) => !isEditorPlatformCommandId(row.command),
  )

  return (
    <Section
      title='Keyboard shortcuts'
      description='Type a shortcut such as Mod+Alt+S to replace a default. Mod is Command on macOS and Control everywhere else.'
    >
      {rows.map((row) => (
        <KeybindingRow key={row.command} binding={row} />
      ))}
    </Section>
  )
}
