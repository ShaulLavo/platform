import { describe, expect, it } from 'vitest'

import { createFocusStore } from '@/features/workspace/providers/focus-state'

describe('createFocusStore', () => {
  it('accepts logs as a focused area', () => {
    const store = createFocusStore()

    store.getState().setFocusArea('logs')

    expect(store.getState().activeArea).toBe('logs')
  })

  it('preserves existing clear semantics', () => {
    const store = createFocusStore()

    store.getState().setFocusArea('editor')
    store.getState().clearFocusArea('file-tree')

    expect(store.getState().activeArea).toBe('editor')

    store.getState().clearFocusArea('editor')

    expect(store.getState().activeArea).toBe(null)
  })
})
