import { describe, expect, it } from 'vitest'

import { commandKeyBindings } from '@/keymap/active-bindings'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import {
  commandsShadowedBy,
  matchingKeybindingRows,
} from '@/features/settings/utils/keybinding-rows'

// Real resolver output, not a fixture, so the helpers are tested against the
// data they actually see. The platform is pinned so the assertions do not
// depend on the machine running them.
const rows = commandKeyBindings(defaultPlatformKeyBindings('linux'), {}, 'linux')

describe('matchingKeybindingRows', () => {
  it('treats an empty query as no filter', () => {
    expect(matchingKeybindingRows(rows, '')).toBe(rows)
    expect(matchingKeybindingRows(rows, '   ')).toBe(rows)
  })

  it('matches on the command id', () => {
    const matched = matchingKeybindingRows(rows, 'save')

    expect(matched).toHaveLength(1)
    expect(matched[0]?.command).toBe('workspace.saveFile')
  })

  // The case an id-only search would miss, and the whole reason the title is in
  // the haystack: neither word appears in the command id.
  it('matches on the title alone', () => {
    const matched = matchingKeybindingRows(rows, 'files pane')

    expect(matched).toHaveLength(1)
    expect(matched[0]?.command).toBe('workspace.toggleSidebarVisibility')
  })

  it('matches on the chord', () => {
    const matched = matchingKeybindingRows(rows, 'Mod+S')

    expect(matched.map((row) => row.command)).toContain('workspace.saveFile')
  })

  it('returns nothing when the query matches nothing', () => {
    expect(matchingKeybindingRows(rows, 'zzznope')).toEqual([])
  })
})

describe('commandsShadowedBy', () => {
  // Reading `shadowedBy` rather than comparing chords is what keeps a global
  // and a pane-scoped copy of one chord from being reported as a conflict.
  it('counts the commands that lost their chord, and only those', () => {
    const shadowed = commandKeyBindings(
      defaultPlatformKeyBindings('linux'),
      { 'workspace.saveFile': 'Mod+B' },
      'linux',
    )

    expect(commandsShadowedBy(shadowed, 'workspace.saveFile')).toBe(1)
    expect(commandsShadowedBy(shadowed, 'workspace.togglePanel')).toBe(0)
  })
})
