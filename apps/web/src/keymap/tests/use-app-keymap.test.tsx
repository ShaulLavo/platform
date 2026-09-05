import { detectPlatform } from '@tanstack/react-hotkeys'
import { act, renderHook } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { commandShortcut, formatChord } from '@/keymap/utils/format-keys'
import { resolvedPlatformKeyBindings } from '@/keymap/active-bindings'
import { defaultPlatformKeyBindings } from '@/keymap/default-bindings'
import type { PlatformCommandBus } from '@/keymap/providers/command-context'
import { useAppKeymap } from '@/keymap/use-app-keymap'
import type { PlatformCommandId } from '@/keymap/types'

import { expect, test } from '../../../test/fixtures'
import { binding } from '../../../test/factories/key-binding'
import { createTestCommandRuntime } from '../../../test/factories/command-runtime'
import { createTestQueryClient } from '../../../test/render'
import { FocusService, type FocusArea, type FocusTargetToken } from '@/lib/focus/state/service'
import { CHORD_TIMEOUT_MS } from '@/keymap/utils/chord'

afterEach(() => vi.useRealTimers())

test('runs the command a pressed key is bound to', () => {
  const dispatched = mountKeymap()

  pressKey(document.body, { code: 'F1', key: 'F1' })

  expect(dispatched).toEqual(['workspace.showCommandPalette'])
})

test('leaves a bare-key shortcut alone while a text field has the caret', () => {
  const dispatched = mountKeymap()
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()

  pressKey(input, { code: 'F1', key: 'F1' })

  expect(dispatched).toEqual([])
  input.remove()
})

test('leaves a bare-key shortcut alone inside a shadow-DOM text field', () => {
  const dispatched = mountKeymap()
  const host = document.createElement('div')
  const shadow = host.attachShadow({ mode: 'open' })
  const input = document.createElement('input')
  shadow.append(input)
  document.body.append(host)
  input.focus()

  pressKey(input, { code: 'F1', composed: true, key: 'F1' })

  expect(dispatched).toEqual([])
  host.remove()
})

test('runs the override instead of the default once a command is rebound', () => {
  const dispatched = mountKeymap({ 'workspace.saveFile': 'Mod+Alt+S' })

  pressKey(document.body, { code: 'KeyS', key: 's', ...modifierKeys() })
  expect(dispatched).toEqual([])

  pressKey(document.body, { altKey: true, code: 'KeyS', key: 's', ...modifierKeys() })
  expect(dispatched).toEqual(['workspace.saveFile'])
})

test('runs the shortcut the menus and palette print for a rebound command', () => {
  // The hint surfaces read the table the hook is handed, so the two cannot
  // disagree: pressing what the hint spells has to reach the command.
  const bindings = keyTable({ 'workspace.saveFile': 'Mod+Alt+S' })
  const dispatched = mountBindings(bindings)

  expect(commandShortcut('workspace.saveFile', bindings)).toBe(formatChord('Mod+Alt+S'))
  expect(commandShortcut('workspace.saveFile', bindings)).not.toBe(formatChord('Mod+S'))
  pressKey(document.body, { altKey: true, code: 'KeyS', key: 's', ...modifierKeys() })

  expect(dispatched).toEqual(['workspace.saveFile'])
})

test('stops running a default whose key an override took', () => {
  // Mod+B is the sidebar toggle by default; handing it to Save leaves the
  // toggle with nothing to answer, which is what the settings row reports.
  const dispatched = mountKeymap({ 'workspace.saveFile': 'Mod+B' })

  pressKey(document.body, { code: 'KeyB', key: 'b', ...modifierKeys() })

  expect(dispatched).toEqual(['workspace.saveFile'])
})

test('leaves a trusted key alone when the command declines synchronously', () => {
  const declined = mountBindings(keyTable(), false)
  const declinedEvent = pressKey(document.body, { code: 'F1', key: 'F1' })

  expect(declinedEvent.defaultPrevented).toBe(false)
  expect(declined).toEqual(['workspace.showCommandPalette'])
})

test('suppresses a trusted key after the command claims it synchronously', () => {
  const claimed = mountBindings(keyTable(), true)
  const event = pressKey(document.body, { code: 'F1', key: 'F1' })

  expect(event.defaultPrevented).toBe(true)
  expect(claimed).toEqual(['workspace.showCommandPalette'])
})

test('suppresses a reserved browser chord without dispatching', () => {
  const dispatched = mountBindings(keyTable())
  const event = pressKey(document.body, { code: 'Tab', ctrlKey: true, key: 'Tab' })

  expect(event.defaultPrevented).toBe(true)
  expect(dispatched).toEqual([])
})

function keyTable(overrides: Record<string, string | null> = {}) {
  const platform = detectPlatform()

  return resolvedPlatformKeyBindings(defaultPlatformKeyBindings(platform), overrides, platform)
}

function mountKeymap(overrides: Record<string, string | null> = {}) {
  return mountBindings(keyTable(overrides))
}

function mountBindings(bindings: ReturnType<typeof keyTable>, claimed = true) {
  const dispatched: PlatformCommandId[] = []
  const bus: Pick<PlatformCommandBus, 'dispatch'> = {
    dispatch: (command: PlatformCommandId) => {
      dispatched.push(command)
      return { claimed, completion: Promise.resolve({ status: 'handled' } as const) }
    },
  }

  renderHook(() =>
    useAppKeymap({
      bindings,
      bus,
      focusedPane: 'global',
    }),
  )

  return dispatched
}

function pressKey(target: EventTarget, init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

/** `Mod` is Command on macOS and Control everywhere else. */
function modifierKeys() {
  if (detectPlatform() === 'mac') return { metaKey: true }

  return { ctrlKey: true }
}

test('captures consecutive strokes synchronously and dispatches through the real bus once', () => {
  const harness = mountChordRuntime()
  const prefix = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code: 'KeyK',
    key: 'k',
    ...modifierKeys(),
  })
  const completion = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    code: 'KeyS',
    key: 's',
    ...modifierKeys(),
  })
  act(() => {
    document.body.dispatchEvent(prefix)
    document.body.dispatchEvent(completion)
  })
  expect(prefix.defaultPrevented).toBe(true)
  expect(completion.defaultPrevented).toBe(true)
  expect(harness.calls).toEqual([false])
  expect(harness.result.current.pendingChord).toBeNull()
})

test('publishes pending state and consumes unmatched text without its single-key action', () => {
  const harness = mountChordRuntime()
  const input = document.createElement('input')
  input.value = 'keep'
  document.body.append(input)
  input.focus()
  let reachedInput = false
  input.addEventListener('keydown', () => {
    reachedInput = true
  })

  pressKey(input, { code: 'KeyK', key: 'k', ...modifierKeys() })
  expect(harness.result.current.pendingChord).toMatchObject({ keys: 'Mod+K', candidateCount: 1 })
  expect(harness.calls).toEqual([])
  reachedInput = false
  const unmatched = pressKey(input, { code: 'KeyX', key: 'x' })

  expect(unmatched.defaultPrevented).toBe(true)
  expect(reachedInput).toBe(false)
  expect(input.value).toBe('keep')
  expect(harness.result.current.pendingChord).toBeNull()
  expect(harness.calls).toEqual([])
  input.remove()
})

test('clears the indicator on a real scheduled timeout without another keystroke', () => {
  vi.useFakeTimers()
  const harness = mountChordRuntime()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  act(() => {
    vi.advanceTimersByTime(CHORD_TIMEOUT_MS)
  })
  expect(harness.result.current.pendingChord).toBeNull()

  const late = pressKey(document.body, { code: 'KeyS', key: 's', ...modifierKeys() })
  expect(late.defaultPrevented).toBe(false)
  expect(harness.calls).toEqual([])
})

test('holding the prefix and pressing modifiers do not extend its deadline', () => {
  vi.useFakeTimers()
  const harness = mountChordRuntime()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  act(() => {
    vi.advanceTimersByTime(CHORD_TIMEOUT_MS - 1)
  })
  const repeat = pressKey(document.body, {
    code: 'KeyK',
    key: 'k',
    repeat: true,
    ...modifierKeys(),
  })
  const modifier = pressKey(document.body, { code: 'ControlLeft', key: 'Control', ctrlKey: true })
  expect(repeat.defaultPrevented).toBe(true)
  expect(modifier.defaultPrevented).toBe(true)
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(harness.result.current.pendingChord).toBeNull()
})

test('Escape, pointer movement to another control and window blur cancel pending chords', () => {
  const harness = mountChordRuntime()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  expect(pressKey(document.body, { key: 'Escape' }).defaultPrevented).toBe(true)
  expect(harness.result.current.pendingChord).toBeNull()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  act(() => {
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  })
  expect(harness.result.current.pendingChord).toBeNull()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  act(() => {
    window.dispatchEvent(new Event('blur'))
  })
  expect(harness.result.current.pendingChord).toBeNull()
  expect(harness.calls).toEqual([])
})

test('composition preserves an armed chord and does not consume IME keystrokes', () => {
  const harness = mountChordRuntime()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  const composition = pressKey(document.body, {
    code: 'KeyS',
    key: 's',
    isComposing: true,
    ...modifierKeys(),
  })
  const firstComposition = pressKey(document.body, {
    keyCode: 229,
    code: 'KeyS',
    key: 's',
    ...modifierKeys(),
  })
  expect(composition.defaultPrevented).toBe(false)
  expect(firstComposition.defaultPrevented).toBe(false)
  expect(harness.result.current.pendingChord).not.toBeNull()
  expect(harness.calls).toEqual([])
  pressKey(document.body, { code: 'KeyS', key: 's', ...modifierKeys() })
  expect(harness.calls).toEqual([false])
})

test('changing owner within one pane, changing pane, and unmounting cancel the session', () => {
  const harness = mountChordRuntime()
  const focus = new FocusService()
  const registration = focus.register({
    area: 'editor',
    element: document.body,
    id: { kind: 'editor', surface: 'document', key: 'next' },
    onIntent: () => false,
  })
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  harness.rerender({ focusedPane: 'global', focusedTarget: registration.token })
  expect(harness.result.current.pendingChord).toBeNull()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  harness.rerender({ focusedPane: 'editor', focusedTarget: registration.token })
  expect(harness.result.current.pendingChord).toBeNull()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  harness.unmount()
  expect(
    pressKey(document.body, { code: 'KeyS', key: 's', ...modifierKeys() }).defaultPrevented,
  ).toBe(false)
  expect(harness.calls).toEqual([])
  registration.unregister()
})

test('a handoff tries an unavailable command once and lets its key reach the terminal', () => {
  const harness = mountChordRuntime()
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'F2' })
  const dispatch = vi.spyOn(harness.bus, 'dispatch')
  let claimed = true
  act(() => {
    claimed = harness.result.current.claimKeybinding(event)
    document.body.dispatchEvent(event)
  })
  expect(claimed).toBe(false)
  expect(dispatch).toHaveBeenCalledTimes(1)
  expect(event.defaultPrevented).toBe(false)
})

test('an unavailable chord completion is still swallowed after the prefix committed it', () => {
  const harness = mountChordRuntime('workspace.focusEditor')
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  const completion = pressKey(document.body, { code: 'KeyS', key: 's', ...modifierKeys() })
  expect(completion.defaultPrevented).toBe(true)
  expect(harness.result.current.pendingChord).toBeNull()
  expect(harness.calls).toEqual([])
})

function mountChordRuntime(
  command: PlatformCommandId = 'workspace.toggleWallpaper',
  keys = 'Mod+K Mod+S',
) {
  const calls: boolean[] = []
  const focus = new FocusService()
  const runtime = createTestCommandRuntime({
    focus,
    options: {
      runtime: {
        settings: {
          setWallpaperEnabled: (enabled) => {
            calls.push(enabled)
            return { kind: 'noop' }
          },
        },
      },
    },
    queryClient: createTestQueryClient(),
  })
  const bindings = [
    binding(keys, { command, platform: detectPlatform() }),
    binding('F2', { command: 'workspace.focusEditor', platform: detectPlatform() }),
  ]
  const props: { focusedPane: FocusArea; focusedTarget: FocusTargetToken | null } = {
    focusedPane: 'global',
    focusedTarget: null,
  }
  const hook = renderHook(
    (options: typeof props) => useAppKeymap({ bindings, bus: runtime.bus, focus, ...options }),
    { initialProps: props },
  )
  return { ...hook, bus: runtime.bus, calls, focus }
}

test('a focus change cancels before React can commit the next owner', () => {
  const harness = mountChordRuntime()
  const first = document.createElement('input')
  const second = document.createElement('input')
  document.body.append(first, second)
  const registrations = [first, second].map((element, index) =>
    harness.focus.register({
      area: 'editor',
      element,
      id: { kind: 'editor', key: `focus-${index}`, surface: 'document' },
      onIntent: () => false,
    }),
  )
  document.addEventListener('focusin', harness.focus.handleFocusIn, true)
  try {
    act(() => {
      first.focus()
    })
    pressKey(first, { code: 'KeyK', key: 'k', ...modifierKeys() })
    const completion = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code: 'KeyS',
      key: 's',
      ...modifierKeys(),
    })
    act(() => {
      second.focus()
      second.dispatchEvent(completion)
    })
    expect(harness.calls).toEqual([])
    expect(harness.result.current.pendingChord).toBeNull()
    expect(completion.defaultPrevented).toBe(false)
  } finally {
    document.removeEventListener('focusin', harness.focus.handleFocusIn, true)
    registrations.forEach((registration) => registration.unregister())
    first.remove()
    second.remove()
  }
})

test('a held prefix remains consumed after timeout until its matching release', () => {
  vi.useFakeTimers()
  const harness = mountChordRuntime()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  act(() => {
    vi.advanceTimersByTime(CHORD_TIMEOUT_MS)
  })
  expect(harness.result.current.pendingChord).toBeNull()
  const repeat = pressKey(document.body, {
    code: 'KeyK',
    key: 'k',
    repeat: true,
    ...modifierKeys(),
  })
  expect(repeat.defaultPrevented).toBe(true)
  const release = new KeyboardEvent('keyup', {
    bubbles: true,
    cancelable: true,
    code: 'KeyK',
    key: 'k',
    ...modifierKeys(),
  })
  act(() => {
    document.body.dispatchEvent(release)
  })
  expect(release.defaultPrevented).toBe(true)
  const freshRepeat = pressKey(document.body, {
    code: 'KeyK',
    key: 'k',
    repeat: true,
    ...modifierKeys(),
  })
  expect(freshRepeat.defaultPrevented).toBe(false)
})

test('holding a chord completion does not dispatch its standalone binding', () => {
  const harness = mountChordRuntime('workspace.toggleWallpaper', 'Mod+K F2')
  const dispatch = vi.spyOn(harness.bus, 'dispatch')
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  pressKey(document.body, { code: 'F2', key: 'F2' })
  harness.rerender({ focusedPane: 'terminal', focusedTarget: null })
  pressKey(document.body, { code: 'F2', key: 'F2', repeat: true })

  expect(dispatch).toHaveBeenCalledTimes(1)
  expect(harness.calls).toEqual([false])

  act(() => {
    document.body.dispatchEvent(
      new KeyboardEvent('keyup', { bubbles: true, code: 'F2', key: 'F2' }),
    )
  })
  pressKey(document.body, { code: 'F2', key: 'F2' })
  pressKey(document.body, { code: 'F2', key: 'F2', repeat: true })
  expect(dispatch).toHaveBeenCalledTimes(3)
})

test('single-stroke commands still dispatch on repeat', () => {
  const harness = mountChordRuntime('workspace.toggleWallpaper', 'F3')
  pressKey(document.body, { code: 'F3', key: 'F3' })
  pressKey(document.body, { code: 'F3', key: 'F3', repeat: true })

  expect(harness.calls).toEqual([false, false])
})

test.each(['x', 'y'])('a held chord stroke %s stays above descendant key handlers', (key) => {
  const harness = mountChordRuntime('workspace.toggleWallpaper', 'Mod+K X')
  const target = document.createElement('div')
  document.body.append(target)
  let inserted = ''
  target.addEventListener('keydown', (event) => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey) return

    inserted += event.key
    event.stopPropagation()
  })
  try {
    pressKey(target, { code: 'KeyK', key: 'k', ...modifierKeys() })
    const code = `Key${key.toUpperCase()}`
    pressKey(target, { code, key })
    const repeat = pressKey(target, { code, key, repeat: true })

    expect(inserted).toBe('')
    expect(repeat.defaultPrevented).toBe(true)
    expect(harness.result.current.pendingChord).toBeNull()

    act(() => {
      target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code, key }))
    })
    pressKey(target, { code, key })
    expect(inserted).toBe(key)
  } finally {
    target.remove()
  }
})

test('hiding the document cancels the pending chord', () => {
  const harness = mountChordRuntime()
  pressKey(document.body, { code: 'KeyK', key: 'k', ...modifierKeys() })
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(harness.result.current.pendingChord).toBeNull()
  visibility.mockRestore()
})
