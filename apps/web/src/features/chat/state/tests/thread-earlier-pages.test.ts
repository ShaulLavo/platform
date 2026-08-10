import {
  ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE,
  threadIdSchema,
  type OrchestrationMessage,
  type OrchestrationThreadDetailPage,
  type OrchestrationThreadDetailSnapshot,
  type OrchestrationWsThreadDetailPageInput,
} from '@workspace/contracts'
import { beforeEach } from 'vitest'
import * as v from 'valibot'

import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { createThreadEarlierPageLoader } from '@/features/chat/state/thread-earlier-pages'
import {
  resetThreadEarlierPageStore,
  selectThreadEarlierPage,
  useThreadEarlierPageStore,
} from '@/features/chat/state/thread-earlier-page-store'
import { unsupportedChatEnvironment } from '../../../../../test/factories/chat-environment'
import { chatMessage, thread as threadFactory } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

const THREAD_ID = v.parse(threadIdSchema, 'thread-1')

beforeEach(() => {
  useChatProjectionStore.getState().resetChatProjection()
  resetThreadEarlierPageStore()
})

test('a page lands in front of the transcript and the boundary moves with it', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([page([message(0), message(1)], true)])

  expect(await loader.load(THREAD_ID)).toBe(true)

  expect(requests[0]?.beforeMessage?.id).toBe('message-2')
  expect(useChatProjectionStore.getState().messageIdsByThreadId[THREAD_ID]?.[0]).toBe('message-0')
})

test('two clicks in the same frame cost one scan', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([page([message(0)], true)])

  const [first, second] = await Promise.all([loader.load(THREAD_ID), loader.load(THREAD_ID)])

  expect(first).toBe(true)
  expect(second).toBe(true)
  expect(requests).toHaveLength(1)
})

test('an exhausted thread is answered without touching the transport', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([page([message(0)], false)])
  await loader.load(THREAD_ID)

  expect(await loader.load(THREAD_ID)).toBe(false)
  expect(requests).toHaveLength(1)
})

test('a failed page is reported and stays retryable', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([new Error('offline'), page([message(0)], true)])

  expect(await loader.load(THREAD_ID)).toBe(false)
  expect(selectThreadEarlierPage(useThreadEarlierPageStore.getState(), THREAD_ID)).toEqual({
    error: 'offline',
    pending: false,
  })

  expect(await loader.load(THREAD_ID)).toBe(true)
  expect(requests).toHaveLength(2)
  expect(selectThreadEarlierPage(useThreadEarlierPageStore.getState(), THREAD_ID).error).toBeNull()
})

test('a page that turns out to be empty ends the walk instead of looping', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([page([], false)])

  expect(await loader.load(THREAD_ID)).toBe(true)
  expect(await loader.load(THREAD_ID)).toBe(false)
  expect(requests).toHaveLength(1)
})

function createLoader(script: Array<OrchestrationThreadDetailPage | Error>) {
  const requests: OrchestrationWsThreadDetailPageInput[] = []
  const loader = createThreadEarlierPageLoader({
    environment: unsupportedChatEnvironment({
      threadDetailPage: async (input) => {
        const next = script[requests.length]
        requests.push(input)
        if (next instanceof Error) throw next
        if (!next) throw new Error('the loader asked for more pages than the test scripted')

        return next
      },
    }),
  })

  return { loader, requests }
}

/** A window at the cap, which is the only state that offers a backwards page. */
function seedFullWindow() {
  useChatProjectionStore
    .getState()
    .syncThreadDetailSnapshot(
      detailSnapshot(
        Array.from({ length: ORCHESTRATION_THREAD_DETAIL_PAGE_SIZE }, (_, index) =>
          message(index + 2),
        ),
      ),
    )
}

function message(index: number): OrchestrationMessage {
  return chatMessage({
    createdAt: createdAt(index),
    id: `message-${index}` as OrchestrationMessage['id'],
    threadId: THREAD_ID,
    updatedAt: createdAt(index),
  })
}

function createdAt(index: number) {
  return new Date(Date.UTC(2026, 4, 24) + index * 1_000).toISOString()
}

function detailSnapshot(messages: OrchestrationMessage[]): OrchestrationThreadDetailSnapshot {
  return {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 1,
    thread: { ...threadFactory({ id: THREAD_ID, messages }), deletedAt: null },
  }
}

function page(
  messages: OrchestrationMessage[],
  hasEarlier: boolean,
): OrchestrationThreadDetailPage {
  return {
    activities: [],
    hasEarlier,
    messages,
    snapshotSequence: 1,
    threadId: THREAD_ID,
  }
}
