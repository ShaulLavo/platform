import type { KeybindingOverrides } from '@workspace/contracts'

import { EmptyRow } from './empty-row'
import { KeybindingRow } from './keybinding-row'
import { Section } from './section'

/**
 * Read-only on purpose: the store and its contract land first so the keybinding
 * editor has somewhere to write. This shows what is already overridden.
 */
export function KeybindingSection({ overrides }: { overrides: KeybindingOverrides }) {
  const entries = Object.entries(overrides)

  return (
    <Section
      title='Keyboard shortcuts'
      description='Overrides that replace the built-in bindings. Editing them lands with the keybinding editor.'
    >
      {entries.length === 0 ? (
        <EmptyRow>No shortcut overrides.</EmptyRow>
      ) : (
        entries.map(([command, keys]) => (
          <KeybindingRow key={command} command={command} keys={keys} />
        ))
      )}
    </Section>
  )
}
