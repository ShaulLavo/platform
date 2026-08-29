import { describe, expect, it, vi } from 'vitest'

import { MountedEditorRegistry } from '@/lib/file-open-intent/state/mounted-editor-registry'

describe('mounted editor registry', () => {
  it('does not publish a false transition during a StrictMode replay', async () => {
    const registry = new MountedEditorRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)

    const unregister = registry.register('/repo/a.ts')
    unregister()
    registry.register('/repo/a.ts')
    await Promise.resolve()

    expect(listener.mock.calls).toEqual([['/repo/a.ts', true]])
    expect(registry.has('/repo/a.ts')).toBe(true)
  })

  it('publishes a real last-owner unmount after the replay window', async () => {
    const registry = new MountedEditorRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)

    const first = registry.register('/repo/a.ts')
    const second = registry.register('/repo/a.ts')
    first()
    second()
    await Promise.resolve()

    expect(listener.mock.calls).toEqual([
      ['/repo/a.ts', true],
      ['/repo/a.ts', false],
    ])
    expect(registry.has('/repo/a.ts')).toBe(false)
  })
})
