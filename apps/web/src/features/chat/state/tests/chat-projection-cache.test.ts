import {
  messageIdSchema,
  threadIdSchema,
  type MessageId,
  type OrchestrationThread,
  type OrchestrationThreadDetailSnapshot,
  type OrchestrationThreadShell,
  type ThreadId,
} from '@workspace/contracts'
import { afterEach, beforeEach } from 'vitest'
import * as v from 'valibot'

import { expect, test } from '../../../../../test/fixtures'
import { chatMessage, shellSnapshot, threadShell } from '../../../../../test/factories/chat'
import {
  CHAT_PROJECTION_CACHE_MESSAGE_LIMIT,
  CHAT_PROJECTION_CACHE_THREAD_LIMIT,
  CHAT_PROJECTION_CACHE_TRANSCRIPT_LIMIT,
} from '@/features/chat/state/chat-cache-constants'
import {
  CHAT_PROJECTION_CACHE_STORAGE_KEY,
  chatProjectionCacheFromState,
  readChatProjectionCache,
} from '@/features/chat/state/chat-projection-cache'
import {
  selectChatSidebarThreads,
  selectChatThreadById,
} from '@/features/chat/state/chat-projection-selectors'
import {
  flushChatProjectionCache,
  restoredChatProjectionState,
  useChatProjectionStore,
} from '@/features/chat/state/chat-projection-store'
import { syncChatProjectionShellSnapshot } from '@/features/chat/state/chat-projection-writers'

const STORE = new Map<string, string>()

beforeEach(() => {
  STORE.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: fakeLocalStorage(),
  })
  useChatProjectionStore.getState().resetChatProjection()
})

afterEach(() => {
  useChatProjectionStore.getState().resetChatProjection()
  delete (globalThis as { localStorage?: Storage }).localStorage
})

test('a cold reload paints the shell and the open transcript from cache, then reconciles to server truth', () => {
  const threadId = parseThreadId('thread-1')
  useChatProjectionStore.getState().syncShellSnapshot(shellSnapshot())
  useChatProjectionStore
    .getState()
    .syncThreadDetailSnapshot(
      threadDetailSnapshot(threadShell(), [
        chatMessage({ id: parseMessageId('message-1'), text: 'cached question' }),
        chatMessage({ id: parseMessageId('message-2'), text: 'cached answer' }),
      ]),
    )
  expect(flushChatProjectionCache()).toBe(true)

  // What the next process sees before any socket has connected.
  const painted = restoredChatProjectionState()

  expect(selectChatSidebarThreads(painted).map((thread) => thread.title)).toEqual(['Thread'])
  expect(selectChatThreadById(painted, threadId)?.messages.map((message) => message.text)).toEqual([
    'cached question',
    'cached answer',
  ])
  // Nothing has been served yet, so the cache must not claim any served ground.
  expect(painted.bootstrapComplete).toBe(false)
  expect(painted.lastAppliedShellSequence).toBe(0)
  expect(painted.threadDetailSequenceById).toEqual({})

  const reconciled = syncChatProjectionShellSnapshot(painted, {
    ...shellSnapshot({ threads: [threadShell({ title: 'Renamed on the server' })] }),
    snapshotSequence: 7,
  })

  expect(selectChatSidebarThreads(reconciled).map((thread) => thread.title)).toEqual([
    'Renamed on the server',
  ])
  expect(reconciled.bootstrapComplete).toBe(true)
  expect(reconciled.lastAppliedShellSequence).toBe(7)
})

test('a version mismatch drops the cache instead of half-reading it', () => {
  useChatProjectionStore.getState().syncShellSnapshot(shellSnapshot())
  expect(flushChatProjectionCache()).toBe(true)

  const stored = JSON.parse(STORE.get(CHAT_PROJECTION_CACHE_STORAGE_KEY) ?? '{}')
  STORE.set(
    CHAT_PROJECTION_CACHE_STORAGE_KEY,
    JSON.stringify({ ...stored, version: stored.version + 1 }),
  )

  expect(readChatProjectionCache()).toBeNull()
  expect(STORE.has(CHAT_PROJECTION_CACHE_STORAGE_KEY)).toBe(false)
  expect(restoredChatProjectionState().projectIds).toEqual([])
})

test('the painted snapshot is bounded by thread, transcript and message capacity', () => {
  const threads = Array.from({ length: CHAT_PROJECTION_CACHE_THREAD_LIMIT + 5 }, (_unused, index) =>
    threadShell({ id: parseThreadId(`thread-${index}`), title: `Thread ${index}` }),
  )
  useChatProjectionStore.getState().syncShellSnapshot(shellSnapshot({ threads }))

  for (const shell of threads.slice(0, CHAT_PROJECTION_CACHE_TRANSCRIPT_LIMIT + 2)) {
    useChatProjectionStore.getState().syncThreadDetailSnapshot(
      threadDetailSnapshot(
        shell,
        Array.from({ length: CHAT_PROJECTION_CACHE_MESSAGE_LIMIT + 10 }, (_unused, index) =>
          chatMessage({ id: parseMessageId(`${shell.id}-message-${index}`), threadId: shell.id }),
        ),
      ),
    )
  }

  const cached = chatProjectionCacheFromState(useChatProjectionStore.getState())

  expect(cached.threads).toHaveLength(CHAT_PROJECTION_CACHE_THREAD_LIMIT)
  expect(cached.transcripts).toHaveLength(CHAT_PROJECTION_CACHE_TRANSCRIPT_LIMIT)
  for (const transcript of cached.transcripts) {
    expect(transcript.messages).toHaveLength(CHAT_PROJECTION_CACHE_MESSAGE_LIMIT)
  }
})

test('a transcript whose thread fell out of the cached shell is skipped, not half-applied', () => {
  const kept = threadShell({ id: parseThreadId('thread-kept') })
  const dropped = threadShell({ id: parseThreadId('thread-dropped') })
  useChatProjectionStore.getState().syncShellSnapshot(shellSnapshot({ threads: [kept, dropped] }))
  useChatProjectionStore
    .getState()
    .syncThreadDetailSnapshot(
      threadDetailSnapshot(dropped, [chatMessage({ id: parseMessageId('message-1') })]),
    )

  const cached = chatProjectionCacheFromState(useChatProjectionStore.getState())
  const withoutThread = { ...cached, threads: [kept] }
  STORE.set(CHAT_PROJECTION_CACHE_STORAGE_KEY, JSON.stringify(withoutThread))

  const painted = restoredChatProjectionState()

  expect(painted.threadIds).toEqual([kept.id])
  expect(painted.messageIdsByThreadId).toEqual({})
})

test('an empty projection is cacheable and restores to an empty shell', () => {
  useChatProjectionStore.getState().syncShellSnapshot(shellSnapshot({ projects: [], threads: [] }))
  expect(flushChatProjectionCache()).toBe(true)

  const painted = restoredChatProjectionState()

  expect(painted.projectIds).toEqual([])
  expect(painted.threadIds).toEqual([])
})

function threadDetailSnapshot(
  shell: OrchestrationThreadShell,
  messages: OrchestrationThread['messages'],
): OrchestrationThreadDetailSnapshot {
  return {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 1,
    thread: {
      activities: [],
      archivedAt: shell.archivedAt,
      branch: shell.branch,
      createdAt: shell.createdAt,
      deletedAt: null,
      id: shell.id,
      interactionMode: shell.interactionMode,
      latestTurn: shell.latestTurn,
      messages,
      modelSelection: shell.modelSelection,
      projectId: shell.projectId,
      runtimeMode: shell.runtimeMode,
      session: shell.session,
      title: shell.title,
      updatedAt: shell.updatedAt,
      worktreePath: shell.worktreePath,
    },
  }
}

function parseThreadId(value: string): ThreadId {
  return v.parse(threadIdSchema, value)
}

function parseMessageId(value: string): MessageId {
  return v.parse(messageIdSchema, value)
}

function fakeLocalStorage(): Storage {
  return {
    clear: () => STORE.clear(),
    getItem: (key: string) => STORE.get(key) ?? null,
    key: (index: number) => Array.from(STORE.keys())[index] ?? null,
    get length() {
      return STORE.size
    },
    removeItem: (key: string) => {
      STORE.delete(key)
    },
    setItem: (key: string, value: string) => {
      STORE.set(key, value)
    },
  }
}
