import '@workspace/ui/globals.css'
import { commands } from 'vitest/browser'
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'

import { EditorTabActionsProvider } from '@/features/editor/providers/tab-actions-provider'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import { MenuSurface } from '@/features/menus/components/surface'
import { useContextMenu } from '@/features/menus/hooks/use-context-menu'
import { actionItem, section } from '@/features/menus/utils/model'
import { useCommand } from '@/keymap/hooks/use-command'
import { CommandProvider } from '@/keymap/providers/command-provider'
import type { PlatformCommandBus } from '@/keymap/providers/command-context'
import type { CommandDispatchTicket } from '@/keymap/state/command-bus'
import type { PlatformCommandId, PlatformKeyBinding } from '@/keymap/types'
import { useAppKeymap } from '@/keymap/use-app-keymap'
import { useFocusTarget } from '@/lib/focus/hooks/use-target'
import { FocusProvider } from '@/lib/focus/providers/provider'
import { FocusService } from '@/lib/focus/state/service'
import { TestCommandProvider } from '../../../test/factories/command-runtime'
import { AppProviders, createTestQueryClient, seedBootMirrorTheme } from '../../../test/render'

declare module 'vitest/browser' {
  interface BrowserCommands {
    proofContextClick: (input: { readonly selector: string }) => Promise<void>
    proofKeyPress: (input: { readonly key: string }) => Promise<void>
  }
}

type TrustedKeyRecord = {
  readonly defaultPrevented: boolean
  readonly key: string
  readonly trusted: boolean
}

const trustedKeyBindings: readonly PlatformKeyBinding[] = [
  binding('F2', 'workspace.focusEditor'),
  binding('F3', 'workspace.toggleWallpaper'),
  binding('F4', null),
]

let root: Root | null = null
let dispatchedKeys: PlatformCommandId[] = []
let editorDispatches: string[] = []
let lastEditorTicket: CommandDispatchTicket | null = null
let removeSecondEditor: (() => void) | null = null
let trustedKeyRecords: TrustedKeyRecord[] = []

afterEach(() => {
  flushSync(() => root?.unmount())
  root = null
  dispatchedKeys = []
  editorDispatches = []
  lastEditorTicket = null
  removeSecondEditor = null
  trustedKeyRecords = []
  document.body.replaceChildren()
  localStorage.clear()
})

test('trusted keys suppress only synchronous claims and reserved chords', async () => {
  mount(<TrustedKeyHarness />)
  const target = await element('[data-trusted-key-target]')
  await expect.poll(() => target.dataset.ready).toBe('true')
  target.focus()

  await commands.proofKeyPress({ key: 'F2' })
  await commands.proofKeyPress({ key: 'F3' })
  await commands.proofKeyPress({ key: 'F4' })

  await expect.poll(() => trustedKeyRecords.length).toBe(3)
  expect(trustedKeyRecords).toEqual([
    { defaultPrevented: false, key: 'F2', trusted: true },
    { defaultPrevented: true, key: 'F3', trusted: true },
    { defaultPrevented: true, key: 'F4', trusted: true },
  ])
  expect(dispatchedKeys).toEqual(['workspace.focusEditor', 'workspace.toggleWallpaper'])
})

test('deepest event target wins and read-only focus cannot fall through', async () => {
  const focus = new FocusService()
  const queryClient = createTestQueryClient()
  mount(
    <FocusProvider service={focus}>
      <TestCommandProvider queryClient={queryClient}>
        <EditorRoutingHarness />
      </TestCommandProvider>
    </FocusProvider>,
  )
  const child = await element('[data-editor-child]')
  child.focus()
  await expect
    .poll(() => focus.getSnapshot().currentOwner?.id)
    .toEqual({
      key: 'child',
      kind: 'editor',
      surface: 'document',
    })

  await commands.proofKeyPress({ key: 'F6' })

  await expect.poll(() => editorDispatches).toEqual(['child:selectAll'])
  expect(lastEditorTicket?.claimed).toBe(true)
  await expect(lastEditorTicket?.completion).resolves.toEqual({ status: 'handled' })

  flushSync(() => removeSecondEditor?.())
  expect(focus.getSnapshot().currentOwner?.id).toEqual({
    key: 'child',
    kind: 'editor',
    surface: 'document',
  })

  const readOnly = await element('[data-editor-readonly]')
  readOnly.focus()
  await commands.proofKeyPress({ key: 'F7' })

  await expect.poll(() => lastEditorTicket?.claimed).toBe(false)
  expect(editorDispatches).toEqual(['child:selectAll'])
  await expect(lastEditorTicket?.completion).resolves.toMatchObject({ status: 'disabled' })
})

test('palette and settings restore only after their modal targets depart', async () => {
  const focus = new FocusService()
  const queryClient = createTestQueryClient()
  seedBootMirrorTheme('dark')
  mount(
    <AppProviders command={false} focusService={focus} queryClient={queryClient}>
      <EditorStateProvider>
        <EditorTabActionsProvider
          requestCloseTab={rejectCloseTab}
          requestCloseTabs={rejectCloseTabs}
        >
          <CommandProvider>
            <OverlayOrigins />
          </CommandProvider>
        </EditorTabActionsProvider>
      </EditorStateProvider>
    </AppProviders>,
  )

  const paletteOrigin = await element('[data-open-palette]')
  paletteOrigin.focus()
  paletteOrigin.click()
  const paletteInput = await element<HTMLInputElement>('input[placeholder="Search commands..."]')
  await expect.poll(() => document.activeElement).toBe(paletteInput)
  expect(focus.getSnapshot().currentOwner?.area).toBe('command-palette')

  await commands.proofKeyPress({ key: 'Escape' })

  await expect
    .poll(() => document.querySelector('input[placeholder="Search commands..."]'))
    .toBeNull()
  await expect.poll(() => document.activeElement).toBe(paletteOrigin)
  expect(focus.getSnapshot().currentOwner?.id).toEqual({
    key: 'palette-origin',
    kind: 'editor',
    surface: 'document',
  })

  const settingsOrigin = await element('[data-open-settings]')
  settingsOrigin.focus()
  settingsOrigin.click()
  const settingsDialog = await element<HTMLElement>('[role="dialog"]')
  await expect.poll(() => settingsDialog.contains(document.activeElement)).toBe(true)
  expect(focus.getSnapshot().currentOwner?.id).toEqual({ kind: 'settings-dialog' })

  await commands.proofKeyPress({ key: 'Escape' })

  await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull()
  await expect.poll(() => document.activeElement).toBe(settingsOrigin)
  expect(focus.getSnapshot().currentOwner?.id).toEqual({
    key: 'settings-origin',
    kind: 'editor',
    surface: 'document',
  })
})

test('a virtual menu restores the context target rather than prior DOM focus', async () => {
  const focus = new FocusService()
  const queryClient = createTestQueryClient()
  mount(
    <FocusProvider service={focus}>
      <TestCommandProvider queryClient={queryClient}>
        <VirtualMenuHarness />
      </TestCommandProvider>
    </FocusProvider>,
  )
  const editor = await element('[data-menu-editor-origin]')
  const terminal = await element('[data-menu-terminal]')
  editor.focus()

  await commands.proofContextClick({ selector: '[data-menu-terminal]' })

  await element('[data-menu-surface="terminal"]')
  expect(document.activeElement).not.toBe(editor)
  await commands.proofKeyPress({ key: 'Escape' })

  await expect.poll(() => document.querySelector('[data-menu-surface="terminal"]')).toBeNull()
  await expect.poll(() => document.activeElement).toBe(terminal)
  expect(focus.getSnapshot().currentOwner?.id).toEqual({
    kind: 'terminal',
    rootPath: '/repo',
    sessionId: 'browser',
  })
})

function TrustedKeyHarness() {
  const targetRef = useRef<HTMLButtonElement>(null)
  useAppKeymap({
    bindings: trustedKeyBindings,
    bus: trustedKeyBus,
    focusedPane: 'global',
  })
  useEffect(() => {
    const recordKey = (event: KeyboardEvent) => {
      trustedKeyRecords.push({
        defaultPrevented: event.defaultPrevented,
        key: event.key,
        trusted: event.isTrusted,
      })
    }
    document.addEventListener('keydown', recordKey)
    if (targetRef.current) targetRef.current.dataset.ready = 'true'

    return () => document.removeEventListener('keydown', recordKey)
  }, [])

  return (
    <button data-trusted-key-target ref={targetRef}>
      Trusted key target
    </button>
  )
}

const trustedKeyBus = {
  dispatch: (command: PlatformCommandId) => {
    dispatchedKeys.push(command)
    const claimed = command === 'workspace.toggleWallpaper'
    return {
      claimed,
      completion: Promise.resolve(
        claimed
          ? ({ status: 'handled' } as const)
          : ({ reason: 'target-unavailable', status: 'unhandled' } as const),
      ),
    }
  },
} as unknown as PlatformCommandBus

function EditorRoutingHarness() {
  const { bus } = useCommand()
  const [secondMounted, setSecondMounted] = useState(true)
  const { ref: parentRef } = useEditorTarget('parent', true)
  const { ref: childRef } = useEditorTarget('child', true)
  const { ref: readOnlyRef } = useEditorTarget('readonly', false)
  const { ref: secondRef } = useEditorTarget('second', true)
  useEffect(() => {
    removeSecondEditor = () => setSecondMounted(false)
    return () => {
      removeSecondEditor = null
    }
  }, [])

  function dispatchFromEvent(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const command = event.key === 'F7' ? 'editor.undo' : 'editor.selectAll'
    lastEditorTicket = bus.dispatch(command, {
      event: event.nativeEvent,
      source: { caller: 'command-focus-browser', kind: 'programmatic' },
    })
  }

  return (
    <div data-workbench>
      <section ref={parentRef}>
        <button data-editor-child onKeyDown={dispatchFromEvent} ref={childRef}>
          Writable child
        </button>
        <button data-editor-readonly onKeyDown={dispatchFromEvent} ref={readOnlyRef}>
          Read-only child
        </button>
      </section>
      {secondMounted ? <button ref={secondRef}>Second editor</button> : null}
    </div>
  )
}

function useEditorTarget(key: string, writable: boolean) {
  return useFocusTarget<HTMLElement>({
    area: 'editor',
    capabilities: {
      editor: {
        dispatch: (command) => {
          editorDispatches.push(`${key}:${command}`)
          return true
        },
        writable,
      },
    },
    id: { key, kind: 'editor', surface: 'document' },
    onIntent: (intent, element) => {
      if (intent !== 'focus') return false

      element.focus()
      return true
    },
  })
}

function OverlayOrigins() {
  const { bus } = useCommand()
  const { ref: paletteOriginRef } = useOriginTarget('palette-origin')
  const { ref: settingsOriginRef } = useOriginTarget('settings-origin')

  return (
    <div data-workbench>
      <button
        data-open-palette
        onClick={() => bus.dispatch('workspace.showCommandPalette', invocation())}
        ref={paletteOriginRef}
      >
        Open palette
      </button>
      <button
        data-open-settings
        onClick={() => bus.dispatch('workspace.showSettings', invocation())}
        ref={settingsOriginRef}
      >
        Open settings
      </button>
    </div>
  )
}

function VirtualMenuHarness() {
  const contextMenu = useContextMenu()
  const { ref: editorRef } = useOriginTarget('menu-editor')
  const { ref: terminalRef } = useFocusTarget<HTMLElement>({
    area: 'terminal',
    id: { kind: 'terminal', rootPath: '/repo', sessionId: 'browser' },
    onIntent: (intent, element) => {
      if (intent !== 'focus') return false

      element.focus()
      return true
    },
  })

  return (
    <div data-workbench>
      <button data-menu-editor-origin ref={editorRef}>
        Editor origin
      </button>
      <section
        data-menu-terminal
        onContextMenu={(event) => contextMenu.openAtEvent(event, event.currentTarget)}
        ref={terminalRef}
        tabIndex={-1}
      >
        Terminal
      </section>
      {contextMenu.anchor ? (
        <MenuSurface
          anchor={contextMenu.anchor}
          menu={[section('browser', [actionItem({ id: 'copy', label: 'Copy', run: () => {} })])]}
          onOpenChange={contextMenu.onOpenChange}
          open
          surface='terminal'
        />
      ) : null}
    </div>
  )
}

function useOriginTarget(key: string) {
  return useFocusTarget<HTMLButtonElement>({
    area: 'editor',
    capabilities: { editor: { dispatch: () => false, writable: true } },
    id: { key, kind: 'editor', surface: 'document' },
    onIntent: (intent, element) => {
      if (intent !== 'focus') return false

      element.focus()
      return true
    },
  })
}

function invocation() {
  return { source: { caller: 'command-focus-browser', kind: 'programmatic' } } as const
}

function binding(keys: string, command: PlatformCommandId | null): PlatformKeyBinding {
  return {
    command,
    hotkey: keys as PlatformKeyBinding['hotkey'],
    keys,
    pane: 'any',
    source: 'default',
  }
}

function mount(children: ReactNode) {
  const host = document.createElement('main')
  document.body.append(host)
  root = createRoot(host)
  flushSync(() => root?.render(children))
}

async function element<E extends HTMLElement = HTMLElement>(selector: string) {
  await expect.poll(() => document.querySelector(selector)).toBeTruthy()
  return document.querySelector<E>(selector)!
}

function rejectCloseTab() {
  return { reason: 'not-found', status: 'rejected' } as const
}

function rejectCloseTabs() {
  return { reason: 'not-found', status: 'rejected' } as const
}
