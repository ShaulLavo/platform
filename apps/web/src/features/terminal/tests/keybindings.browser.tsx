import '@workspace/ui/globals.css'
import { detectPlatform } from '@tanstack/react-hotkeys'
import { flushSync } from 'react-dom'
import { commands } from 'vitest/browser'
import { expect, test } from 'vitest'

import { CHORD_TIMEOUT_MS } from '@/keymap/utils/chord'

import { binding } from '../../../../test/factories/key-binding'
import { createTerminalKeymap } from '../../../../test/factories/terminal-keymap'

declare module 'vitest/browser' {
  interface BrowserCommands {
    proofKeyDown: (input: { readonly key: string }) => Promise<void>
    proofKeyPress: (input: { readonly key: string }) => Promise<void>
    proofKeyUp: (input: { readonly key: string }) => Promise<void>
  }
}

test('terminal shortcuts claim before encoding and ordinary shell input still reaches wasm', async () => {
  const platform = detectPlatform()
  const scenario = await createTerminalKeymap([
    binding('Mod+K Mod+S', { command: 'workspace.toggleWallpaper', platform }),
    binding('Mod+B', { command: 'workspace.toggleWallpaper', platform }),
  ])
  const modifier = platform === 'mac' ? 'Meta' : 'Control'
  try {
    await expect.poll(() => scenario.focus.getSnapshot().currentOwner?.area).toBe('terminal')
    await commands.proofKeyPress({ key: 'a' })
    expect(scenario.output.join('')).toBe('a')
    scenario.output.length = 0

    await commands.proofKeyPress({ key: `${modifier}+k` })
    expect(scenario.calls).toHaveLength(0)
    expect(scenario.output).toEqual([])

    await commands.proofKeyPress({ key: `${modifier}+s` })
    expect(scenario.calls).toHaveLength(1)
    expect(scenario.output).toEqual([])

    await commands.proofKeyPress({ key: `${modifier}+b` })
    expect(scenario.calls).toHaveLength(2)
    expect(scenario.output).toEqual([])
  } finally {
    scenario.dispose()
  }
})

test('a swallowed terminal continuation cannot leak a Kitty key release', async () => {
  const platform = detectPlatform()
  const scenario = await createTerminalKeymap([
    binding('Mod+K Mod+S', { command: 'workspace.toggleWallpaper', platform }),
  ])
  const modifier = platform === 'mac' ? 'Meta' : 'Control'
  try {
    await expect.poll(() => scenario.focus.getSnapshot().currentOwner?.area).toBe('terminal')
    scenario.terminal.write('\u001b[>3u')
    await commands.proofKeyPress({ key: `${modifier}+k` })
    await commands.proofKeyPress({ key: 'x' })

    expect(scenario.calls).toHaveLength(0)
    expect(scenario.output).toEqual([])

    await commands.proofKeyPress({ key: 'y' })
    expect(scenario.output.join('')).toContain('121')
    expect(scenario.output.join('')).toContain(':3')
  } finally {
    scenario.dispose()
  }
})

test('unavailable commands and an unbound chord prefix leave shell input alone', async () => {
  const scenario = await createTerminalKeymap([
    binding('Control+D', { command: 'workspace.saveFile', platform: detectPlatform() }),
  ])
  try {
    await expect.poll(() => scenario.focus.getSnapshot().currentOwner?.area).toBe('terminal')
    await commands.proofKeyPress({ key: 'Control+d' })
    await commands.proofKeyPress({ key: 'Control+k' })

    expect(scenario.calls).toHaveLength(0)
    expect(scenario.output.join('')).toBe('\u0004\u000b')
  } finally {
    scenario.dispose()
  }
})

test('claimed key releases remain swallowed after another terminal owner takes focus', async () => {
  const platform = detectPlatform()
  const scenario = await createTerminalKeymap([
    binding('Mod+K Mod+S', { command: 'workspace.toggleWallpaper', platform }),
  ])
  const modifier = platform === 'mac' ? 'Meta' : 'Control'
  try {
    scenario.terminal.write('\u001b[>3u')
    await commands.proofKeyDown({ key: modifier })
    await commands.proofKeyDown({ key: 'k' })
    expect(scenario.pendingChord()).not.toBeNull()

    flushSync(() => scenario.alternateTarget.focus())
    expect(scenario.pendingChord()).toBeNull()
    flushSync(() => scenario.terminal.focus())

    await commands.proofKeyUp({ key: 'k' })
    await commands.proofKeyUp({ key: modifier })

    expect(scenario.calls).toHaveLength(0)
    expect(scenario.output).toEqual([])
  } finally {
    await commands.proofKeyUp({ key: 'k' })
    await commands.proofKeyUp({ key: modifier })
    scenario.dispose()
  }
})

test(
  'a held prefix stays out of the shell after the chord timeout',
  async () => {
    const platform = detectPlatform()
    const scenario = await createTerminalKeymap([
      binding('Mod+K Mod+S', { command: 'workspace.toggleWallpaper', platform }),
    ])
    const modifier = platform === 'mac' ? 'Meta' : 'Control'
    try {
      scenario.terminal.write('\u001b[>3u')
      await commands.proofKeyDown({ key: modifier })
      await commands.proofKeyDown({ key: 'k' })
      expect(scenario.pendingChord()).not.toBeNull()
      await expect.poll(scenario.pendingChord, { timeout: CHORD_TIMEOUT_MS + 1_000 }).toBeNull()

      await commands.proofKeyDown({ key: 'k' })
      await commands.proofKeyUp({ key: 'k' })
      await commands.proofKeyUp({ key: modifier })

      expect(scenario.calls).toHaveLength(0)
      expect(scenario.output).toEqual([])
    } finally {
      await commands.proofKeyUp({ key: 'k' })
      await commands.proofKeyUp({ key: modifier })
      scenario.dispose()
    }
  },
  CHORD_TIMEOUT_MS + 3_000,
)
