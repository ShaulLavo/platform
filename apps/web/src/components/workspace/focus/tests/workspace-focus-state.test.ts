import { describe, expect, it } from 'bun:test'

import { createWorkspaceFocusStore } from '@/components/workspace/focus/providers/workspace-focus-state'

describe('createWorkspaceFocusStore', () => {
  it('accepts logs as a focused area', () => {
    const store = createWorkspaceFocusStore()

    store.getState().setFocusArea('logs')

    expect(store.getState().activeArea).toBe('logs')
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
