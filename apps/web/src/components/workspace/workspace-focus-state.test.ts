import { describe, expect, it } from 'bun:test'

import { createWorkspaceFocusStore } from './workspace-focus-state'

describe('createWorkspaceFocusStore', () => {
  it('accepts git as a focused area', () => {
    const store = createWorkspaceFocusStore()

    store.getState().setFocusArea('git')

    expect(store.getState().activeArea).toBe('git')
  })

  it('preserves existing clear semantics', () => {
    const store = createWorkspaceFocusStore()

    store.getState().setFocusArea('editor')
    store.getState().clearFocusArea('file-tree')

    expect(store.getState().activeArea).toBe('editor')

    store.getState().clearFocusArea('editor')

    expect(store.getState().activeArea).toBe(null)
  })
})
