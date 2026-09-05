import { TEST_ENVIRONMENT_ID as FIXTURE_ENVIRONMENT_ID } from '../../../../../test/factories/chat'
import {
  ORCHESTRATION_SESSION_DETAIL_PAGE_SIZE,
  sessionIdSchema,
  type OrchestrationMessage,
  type OrchestrationSessionDetailPage,
  type OrchestrationSessionDetailSnapshot,
  type OrchestrationWsSessionDetailPageInput,
} from '@workspace/contracts'
import { beforeEach } from 'vitest'
import * as v from 'valibot'

import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { createSessionEarlierPageLoader } from '@/features/chat/state/session-earlier-pages'
import {
  resetSessionEarlierPageStore,
  selectSessionEarlierPage,
  useSessionEarlierPageStore,
} from '@/features/chat/state/session-earlier-page-store'
import { unsupportedChatTransport } from '../../../../../test/factories/chat-transport'
import { chatMessage, session as sessionFactory } from '../../../../../test/factories/chat'
import { expect, test } from '../../../../../test/fixtures'

const SESSION_ID = v.parse(sessionIdSchema, 'ad686244-5b2e-59be-805f-ef86eac80feb')

beforeEach(() => {
  useChatProjectionStore.getState().resetChatProjection()
  resetSessionEarlierPageStore()
})

test('a page lands in front of the transcript and the boundary moves with it', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([page([message(0), message(1)], true)])

  expect(await loader.load(SESSION_ID)).toBe(true)

  expect(requests[0]?.beforeMessage?.id).toBe('message-2')
  expect(
    useChatProjectionStore.getState().slices[FIXTURE_ENVIRONMENT_ID]!.messageIdsBySessionId[
      SESSION_ID
    ]?.[0],
  ).toBe('message-0')
})

test('two clicks in the same frame cost one scan', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([page([message(0)], true)])

  const [first, second] = await Promise.all([loader.load(SESSION_ID), loader.load(SESSION_ID)])

  expect(first).toBe(true)
  expect(second).toBe(true)
  expect(requests).toHaveLength(1)
})

test('an exhausted session is answered without touching the transport', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([page([message(0)], false)])
  await loader.load(SESSION_ID)

  expect(await loader.load(SESSION_ID)).toBe(false)
  expect(requests).toHaveLength(1)
})

test('a failed page is reported and stays retryable', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([new Error('offline'), page([message(0)], true)])

  expect(await loader.load(SESSION_ID)).toBe(false)
  expect(
    selectSessionEarlierPage(useSessionEarlierPageStore.getState(), {
      environmentId: FIXTURE_ENVIRONMENT_ID,
      sessionId: SESSION_ID,
    }),
  ).toEqual({
    error: 'offline',
    pending: false,
  })

  expect(await loader.load(SESSION_ID)).toBe(true)
  expect(requests).toHaveLength(2)
  expect(
    selectSessionEarlierPage(useSessionEarlierPageStore.getState(), {
      environmentId: FIXTURE_ENVIRONMENT_ID,
      sessionId: SESSION_ID,
    }).error,
  ).toBeNull()
})

test('a page that turns out to be empty ends the walk instead of looping', async () => {
  seedFullWindow()
  const { loader, requests } = createLoader([page([], false)])

  expect(await loader.load(SESSION_ID)).toBe(true)
  expect(await loader.load(SESSION_ID)).toBe(false)
  expect(requests).toHaveLength(1)
})

test('disposing clears pending state and discards a late page', async () => {
  seedFullWindow()
  const response = Promise.withResolvers<OrchestrationSessionDetailPage>()
  const loader = createSessionEarlierPageLoader({
    environmentId: FIXTURE_ENVIRONMENT_ID,
    transport: unsupportedChatTransport({ sessionDetailPage: () => response.promise }),
  })
  const request = loader.load(SESSION_ID)
  expect(
    selectSessionEarlierPage(useSessionEarlierPageStore.getState(), {
      environmentId: FIXTURE_ENVIRONMENT_ID,
      sessionId: SESSION_ID,
    }).pending,
  ).toBe(true)

  loader.dispose()
  expect(
    selectSessionEarlierPage(useSessionEarlierPageStore.getState(), {
      environmentId: FIXTURE_ENVIRONMENT_ID,
      sessionId: SESSION_ID,
    }).pending,
  ).toBe(false)
  response.resolve(page([message(0)], true))

  expect(await request).toBe(false)
  expect(
    useChatProjectionStore.getState().slices[FIXTURE_ENVIRONMENT_ID]!.messageIdsBySessionId[
      SESSION_ID
    ]?.[0],
  ).toBe('message-2')
  expect(await loader.load(SESSION_ID)).toBe(false)
})

function createLoader(script: Array<OrchestrationSessionDetailPage | Error>) {
  const requests: OrchestrationWsSessionDetailPageInput[] = []
  const loader = createSessionEarlierPageLoader({
    environmentId: FIXTURE_ENVIRONMENT_ID,
    transport: unsupportedChatTransport({
      sessionDetailPage: async (input) => {
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
    .syncSessionDetailSnapshot(
      FIXTURE_ENVIRONMENT_ID,
      detailSnapshot(
        Array.from({ length: ORCHESTRATION_SESSION_DETAIL_PAGE_SIZE }, (_, index) =>
          message(index + 2),
        ),
      ),
    )
}

function message(index: number): OrchestrationMessage {
  return chatMessage({
    createdAt: createdAt(index),
    id: `message-${index}` as OrchestrationMessage['id'],
    sessionId: SESSION_ID,
    updatedAt: createdAt(index),
  })
}

function createdAt(index: number) {
  return new Date(Date.UTC(2026, 4, 24) + index * 1_000).toISOString()
}

function detailSnapshot(messages: OrchestrationMessage[]): OrchestrationSessionDetailSnapshot {
  return {
    checkpoints: [],
    proposedPlans: [],
    snapshotSequence: 1,
    session: { deletion: null, ...sessionFactory({ id: SESSION_ID, messages }), deletedAt: null },
  }
}

function page(
  messages: OrchestrationMessage[],
  hasEarlier: boolean,
): OrchestrationSessionDetailPage {
  return {
    activities: [],
    hasEarlier,
    messages,
    snapshotSequence: 1,
    sessionId: SESSION_ID,
  }
}
