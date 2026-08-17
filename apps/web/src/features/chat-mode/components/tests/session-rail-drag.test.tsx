import {
  eventIdSchema,
  projectIdSchema,
  threadIdSchema,
  type ClientOrchestrationCommand,
  type OrchestrationThreadShell,
} from '@workspace/contracts'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach } from 'vitest'
import * as v from 'valibot'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { SessionRail } from '@/features/chat-mode/components/session-rail'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import { ChatRailOrderProvider } from '@/features/chat-mode/providers/rail-order-provider'
import {
  ChatModeSessionContext,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { resetRailOrderStore } from '@/features/chat-mode/state/rail-order-store'
import { setSessionProjectOpener } from '@/features/chat-mode/state/session-commands'
import { useSessionMultiSelectStore } from '@/features/chat-mode/state/session-multi-select-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { resetSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import {
  resetSessionSelectionStore,
  useSessionSelectionStore,
} from '@/features/chat-mode/state/session-selection-store'
import { useActiveProjectStore } from '@/state/active-project-store'
import { chatProject, shellSnapshot, threadShell } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

const platformId = v.parse(projectIdSchema, 'project-platform')
const siteId = v.parse(projectIdSchema, 'project-site')
const docsId = v.parse(projectIdSchema, 'project-docs')
const firstThreadId = v.parse(threadIdSchema, 'thread-first')
const secondThreadId = v.parse(threadIdSchema, 'thread-second')
const thirdThreadId = v.parse(threadIdSchema, 'thread-third')
const settled = { latestTurn: null, session: null } satisfies Partial<OrchestrationThreadShell>

let restoreRects: (() => void) | null = null

afterEach(() => {
  restoreRects?.()
  restoreRects = null
})

test('dropping a project writes one project.reorder with a key between its new neighbours', async () => {
  seedProjection()
  const calls = renderRail()

  await dragWithKeyboard(projectHandle('docs'), '{ArrowUp}')

  expect(calls.dispatched).toHaveLength(1)
  const command = calls.dispatched[0]
  expect(command?.type).toBe('project.reorder')
  expect(command).toMatchObject({ projectId: docsId })
  // Landed between platform ('b') and site ('d'); neither neighbour is rewritten.
  const orderKey = commandOrderKey(command)
  expect(orderKey.localeCompare('b')).toBe(1)
  expect(orderKey.localeCompare('d')).toBe(-1)
  expect(projectRoots()).toEqual(['/repo/platform', '/repo/docs', '/repo/site'])
})

test('a collapsed project band is still draggable', async () => {
  seedProjection()
  const calls = renderRail()

  await userEvent.click(projectHandle('docs'))
  expect(projectHandle('docs')).toHaveAttribute('aria-expanded', 'false')

  await dragWithKeyboard(projectHandle('docs'), '{ArrowUp}')

  expect(calls.dispatched.map((command) => command.type)).toEqual(['project.reorder'])
  // Space picked the band up; it must not also have fired the header's toggle.
  expect(projectHandle('docs')).toHaveAttribute('aria-expanded', 'false')
})

test('dropping a session writes one thread.pin.reorder', async () => {
  seedProjection()
  const calls = renderRail()

  await dragWithKeyboard(screen.getByTitle('Third'), '{ArrowUp}')

  expect(calls.dispatched).toHaveLength(1)
  expect(calls.dispatched[0]?.type).toBe('thread.pin.reorder')
  expect(calls.dispatched[0]).toMatchObject({ threadId: thirdThreadId })
  const orderKey = commandOrderKey(calls.dispatched[0])
  expect(orderKey.localeCompare('b')).toBe(1)
  expect(orderKey.localeCompare('d')).toBe(-1)
  expect(sessionTitles()).toEqual(['First', 'Third', 'Second', 'Site work', 'Docs work'])
})

/**
 * The server refuses to reorder a session that holds no slot yet, so the first
 * drag carries the key in as the pin that places it. Same key, same concept.
 */
test('the first drag of an unarranged session places it instead', async () => {
  seedProjection({ arranged: false })
  const calls = renderRail()

  await dragWithKeyboard(screen.getByTitle('Third'), '{ArrowUp}')

  expect(calls.dispatched.map((command) => command.type)).toEqual(['thread.pin'])
  expect(calls.dispatched[0]).toMatchObject({ threadId: thirdThreadId })
})

test('a plain click still selects the session it landed on', async () => {
  seedProjection()
  const calls = renderRail()

  await userEvent.click(screen.getByTitle('Second'))

  expect(calls.dispatched).toEqual([])
  expect(useSessionSelectionStore.getState().selection).toEqual({
    kind: 'session',
    projectId: platformId,
    threadId: secondThreadId,
  })
})

test('the keyboard reorders a session without ever touching a pointer', async () => {
  seedProjection()
  const calls = renderRail()

  await dragWithKeyboard(screen.getByTitle('First'), '{ArrowDown}')

  expect(calls.dispatched.map((command) => command.type)).toEqual(['thread.pin.reorder'])
  expect(calls.dispatched[0]).toMatchObject({ threadId: firstThreadId })
  expect(sessionTitles()).toEqual(['Second', 'First', 'Third', 'Site work', 'Docs work'])
})

test('a refused reorder falls back to the order the server still holds', async () => {
  seedProjection()
  const calls = renderRail({ reject: true })

  await dragWithKeyboard(screen.getByTitle('Third'), '{ArrowUp}')

  expect(calls.dispatched).toHaveLength(1)
  // The optimistic key was the only thing holding the row in its new slot.
  await waitFor(() =>
    expect(sessionTitles()).toEqual(['First', 'Second', 'Third', 'Site work', 'Docs work']),
  )
})

/**
 * dnd-kit resolves a drop from measured rects, and happy-dom measures every
 * element as a zero rect — so without this the drag reports itself as the row it
 * was released over and nothing moves. Document order is the layout: the rail is
 * one vertical list of blocks.
 */
function stubVerticalRects() {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function railRect(this: Element): DOMRect {
    const top = [...document.querySelectorAll('*')].indexOf(this) * 10

    return {
      bottom: top + 10,
      height: 10,
      left: 0,
      right: 100,
      toJSON: () => ({}),
      top,
      width: 100,
      x: 0,
      y: top,
    } as DOMRect
  }

  return () => {
    Element.prototype.getBoundingClientRect = original
  }
}

/** Space picks the row up, an arrow moves it, Space drops it. */
async function dragWithKeyboard(handle: HTMLElement, move: string) {
  handle.focus()
  await userEvent.keyboard('{ }')
  await userEvent.keyboard(move)
  await userEvent.keyboard('{ }')
}

function commandOrderKey(command: ClientOrchestrationCommand | undefined) {
  return command && 'orderKey' in command ? (command.orderKey ?? '') : ''
}

function projectHandle(title: string) {
  return screen.getByRole('button', { name: new RegExp(title) })
}

/** Band headers carry their project's root as the title, in rail order. */
function projectRoots() {
  return screen.queryAllByTitle(/^\/repo\//).map((element) => element.getAttribute('title') ?? '')
}

function sessionTitles() {
  return screen
    .queryAllByRole('button')
    .filter((element) => element.className.includes('group/session'))
    .map((element) => element.getAttribute('title') ?? '')
}

function seededProjects() {
  return [
    chatProject({
      createdAt: '2026-04-01T00:00:00.000Z',
      id: platformId,
      orderKey: 'b',
      title: 'platform',
      workspaceRoot: '/repo/platform',
    }),
    chatProject({
      createdAt: '2026-04-02T00:00:00.000Z',
      id: siteId,
      orderKey: 'd',
      title: 'site',
      workspaceRoot: '/repo/site',
    }),
    chatProject({
      createdAt: '2026-04-03T00:00:00.000Z',
      id: docsId,
      orderKey: 'f',
      title: 'docs',
      workspaceRoot: '/repo/docs',
    }),
  ]
}

function seedProjection({ arranged = true }: { arranged?: boolean } = {}) {
  const keys = arranged ? ['b', 'd', 'f'] : [null, null, null]

  useSessionRailStore.setState({
    collapsedProjectIds: [],
    query: '',
    renaming: null,
    scope: null,
    view: 'active',
  })
  useSessionMultiSelectStore.getState().clear()
  resetSessionSelectionStore()
  resetRailOrderStore()
  resetSessionReadStore()
  useActiveProjectStore.setState({ workspaceRoot: '/repo/platform' })
  useChatProjectionStore.getState().resetChatProjection()
  useChatProjectionStore.getState().syncShellSnapshot(
    shellSnapshot({
      projects: seededProjects(),
      threads: [
        railThread(firstThreadId, 'First', platformId),
        railThread(secondThreadId, 'Second', platformId),
        railThread(thirdThreadId, 'Third', platformId),
        railThread(v.parse(threadIdSchema, 'thread-site'), 'Site work', siteId),
        railThread(v.parse(threadIdSchema, 'thread-docs'), 'Docs work', docsId),
      ],
    }),
  )
  // The shell carries no pin state, so the arranged slots arrive as events —
  // the same path a reorder from another client takes.
  if (!arranged) return

  const threadIds = [firstThreadId, secondThreadId, thirdThreadId]
  threadIds.forEach((threadId, index) => {
    useChatProjectionStore.getState().applyOrchestrationEvent({
      actorKind: 'client',
      aggregateId: threadId,
      aggregateKind: 'thread',
      causationEventId: null,
      commandId: null,
      correlationId: null,
      eventId: v.parse(eventIdSchema, `event-pin-${index}`),
      metadata: {},
      occurredAt: '2026-05-10T00:00:00.000Z',
      payload: { orderKey: keys[index] ?? 'b', threadId, updatedAt: '2026-05-10T00:00:00.000Z' },
      sequence: 100 + index,
      type: 'thread.pin-reordered',
    })
  })
}

function railThread(
  id: typeof firstThreadId,
  title: string,
  projectId: typeof platformId,
): OrchestrationThreadShell {
  return threadShell({
    ...settled,
    createdAt: '2026-05-01T00:00:00.000Z',
    id,
    projectId,
    title,
  })
}

function renderRail({ reject = false }: { reject?: boolean } = {}) {
  const calls = {
    dispatched: [] as ClientOrchestrationCommand[],
    openedProjects: [] as string[],
  }
  const session: ChatModeSession = {
    activeSession: { status: 'ready', threadId: firstThreadId },
    addProject: () => {},
    environment: {
      dispatchCommand: async (command: ClientOrchestrationCommand) => {
        calls.dispatched.push(command)
        if (reject) throw new Error('refused')

        return { deduped: false, sequence: calls.dispatched.length }
      },
    } as ChatEnvironment,
    error: null,
    openProject: (workspaceRoot) => calls.openedProjects.push(workspaceRoot),
    project: seededProjects()[0] ?? null,
    ready: true,
    retrying: false,
    retryProject: () => {},
    rootPath: '/repo/platform',
    selectSession: () => {},
    startDraft: () => {},
    threads: [],
  }

  setSessionProjectOpener((workspaceRoot) => calls.openedProjects.push(workspaceRoot))
  renderWithProviders(
    <EditorStateProvider>
      <ChatModeSessionContext value={session}>
        <ChatRailOrderProvider>
          <SessionRail />
        </ChatRailOrderProvider>
      </ChatModeSessionContext>
    </EditorStateProvider>,
  )
  restoreRects = stubVerticalRects()

  return calls
}
