import { afterEach, describe, expect, it } from 'vitest'

import { hasNativeVibrancyShell } from '../platform/bridge'
import { hasNativeVibrancy, applyNativeVibrancy } from '../platform/native-vibrancy'

afterEach(() => {
  delete window.platformBridge
  document.documentElement.removeAttribute('data-native-vibrancy')
})

describe('hasNativeVibrancyShell', () => {
  it('is false in a browser, where nothing is behind the page', () => {
    expect(hasNativeVibrancyShell()).toBe(false)
  })

  // The regression this guards: the desktop shell used to be assumed
  // transparent, so the web layer skipped its wallpaper while the opaque window
  // hid the NSVisualEffectView — leaving no backdrop at all.
  it('is false in a desktop shell whose window is opaque', () => {
    window.platformBridge = { hasNativeVibrancy: false, pickEntry: async () => [] }

    expect(hasNativeVibrancyShell()).toBe(false)
  })

  it('is true only when the shell reports a transparent window', () => {
    window.platformBridge = { hasNativeVibrancy: true, pickEntry: async () => [] }

    expect(hasNativeVibrancyShell()).toBe(true)
  })
})

describe('applyNativeVibrancy', () => {
  it('marks the document only when the compositor supplies the backdrop', () => {
    applyNativeVibrancy(false)
    expect(hasNativeVibrancy()).toBe(false)

    applyNativeVibrancy(true)
    expect(hasNativeVibrancy()).toBe(true)
  })
})
