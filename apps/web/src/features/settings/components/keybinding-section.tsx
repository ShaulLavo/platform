import type { KeybindingOverrides } from '@workspace/contracts'

import { commandKeyBindings } from '@/keymap/active-bindings'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'

import { KeybindingRow } from './keybinding-row'
import { Section } from './section'

/**
 * Every command, editor ones included. They used to be filtered out because the
 * editor built its keymap from the raw defaults, so an override here would have
 * looked like it took effect and done nothing — `AppRuntimeContent` now resolves
 * overrides before building the editor layers, which is what makes the row honest.
 */
export function KeybindingSection({ overrides }: { overrides: KeybindingOverrides }) {
  const rows = commandKeyBindings(defaultPlatformKeyBindings(), overrides)

  return (
    <Section
      title='Keyboard shortcuts'
      description='Type a shortcut such as Mod+Alt+S to replace a default. Mod is Command on macOS and Control everywhere else. A shortcut you take from another command stops working for that command, which is marked as shadowed.'
    >
      {rows.map((row) => (
        <KeybindingRow key={row.command} binding={row} />
      ))}
    </Section>
  )
}
