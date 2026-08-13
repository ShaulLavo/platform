import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { defineSetting } from '../settings/registry'
import { deriveWriteTarget, type SettingsLayer } from '../settings/resolve'

const registry = {
  'editor.fontSize': defineSetting({
    schema: v.number(),
    default: 13,
    scope: 'window',
    widget: 'number',
    category: 'Editor',
    description: 'x',
  }),
  'terminal.shell': defineSetting({
    schema: v.string(),
    default: '/bin/zsh',
    scope: 'machine',
    widget: 'string',
    category: 'Terminal',
    description: 'x',
  }),
}

const layer = (id: SettingsLayer['id'], raw: Record<string, unknown>): SettingsLayer => ({
  id,
  raw,
})

describe('deriveWriteTarget', () => {
  it('writes to the user file when nothing sets the key', () => {
    expect(deriveWriteTarget('editor.fontSize', [], registry)).toBe('user')
  })

  it('edits the workspace file when the workspace already sets the key', () => {
    // Otherwise the write lands in the user file and the workspace immediately
    // overrides it, which looks like the setting ignored the change.
    const layers = [layer('workspace', { 'editor.fontSize': 18 })]

    expect(deriveWriteTarget('editor.fontSize', layers, registry)).toBe('workspace')
  })

  it('stays on the user file when only the user sets the key', () => {
    const layers = [layer('user', { 'editor.fontSize': 15 })]

    expect(deriveWriteTarget('editor.fontSize', layers, registry)).toBe('user')
  })

  it('never targets the workspace for a key that layer may not carry', () => {
    // A machine-scoped key in a workspace file is dropped on read, so deriving a
    // workspace write would produce an edit that could never take effect.
    const layers = [layer('workspace', { 'terminal.shell': '/tmp/evil' })]

    expect(deriveWriteTarget('terminal.shell', layers, registry)).toBe('user')
  })

  it('falls back to the user file for a key it does not know', () => {
    expect(deriveWriteTarget('not.registered', [], registry)).toBe('user')
  })
})
