import type {
  ClientOrchestrationCommand,
  OrchestrationReplayEventsInput,
  OrchestrationReplayEventsResult,
  OrchestrationShellStreamItem,
  OrchestrationThreadStreamItem,
} from '@workspace/contracts'
import { act, renderHook, waitFor } from '@testing-library/react'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import { useChatShellSubscription } from '@/features/chat/hooks/use-chat-shell-subscription'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { createClientError } from '@/lib/structured-errors'
import { expect, test } from '../../../../../test/fixtures'

test('a dropped shell stream reconnects instead of dying', async () => {
  useChatProjectionStore.getState().resetChatProjection()
  const environment = createShellEnvironment([{ fail: dropped() }])

  const { result } = renderHook(() => useChatShellSubscription(environment))

  await waitFor(() => expect(result.current.phase).toBe('reconnecting'))
  expect(result.current.attempt).toBe(1)
  expect(result.current.error).toBe('Shell stream dropped.')

  // Returning to the app probes immediately rather than serving the rest of the
  // rung: the deadline here is below the 250ms first rung on purpose.
  act(() => window.dispatchEvent(new Event('focus')))

  await waitFor(() => expect(environment.attempts()).toBe(2), { interval: 5, timeout: 120 })
})

test('a rejected shell socket parks instead of retrying forever', async () => {
  useChatProjectionStore.getState().resetChatProjection()
  const environment = createShellEnvironment([{ fail: rejected() }])

  const { result } = renderHook(() => useChatShellSubscription(environment))

  await waitFor(() => expect(result.current.phase).toBe('blocked'))
  await new Promise((resolve) => setTimeout(resolve, 400))

  expect(environment.attempts()).toBe(1)
  expect(result.current.error).toBe('Shell socket rejected.')
})

test('an offline browser parks until the network comes back', async () => {
  useChatProjectionStore.getState().resetChatProjection()
  const environment = createShellEnvironment()
  setOnline(false)

  const { result } = renderHook(() => useChatShellSubscription(environment))

  await waitFor(() => expect(result.current.phase).toBe('offline'))
  expect(environment.attempts()).toBe(0)

  setOnline(true)
  act(() => window.dispatchEvent(new Event('online')))

  await waitFor(() => expect(environment.attempts()).toBe(1))
})

type ScriptedAttempt = {
  fail?: unknown
}

function createShellEnvironment(script: ScriptedAttempt[] = []) {
  let attempts = 0

  const environment: ChatEnvironment & { attempts: () => number } = {
    attempts: () => attempts,
    dispatchCommand: async (_command: ClientOrchestrationCommand) => ({
      deduped: false,
      sequence: 0,
    }),
    replayEvents: async (
      _input: OrchestrationReplayEventsInput,
    ): Promise<OrchestrationReplayEventsResult> => ({ events: [] }),
    shellStream: async function* (): AsyncGenerator<OrchestrationShellStreamItem> {
      const attempt = script[attempts] ?? {}
      attempts += 1
      if (attempt.fail) throw attempt.fail

      yield await new Promise<OrchestrationShellStreamItem>(() => undefined)
    },
    threadDetailSnapshot: async () => {
      throw dropped()
    },
    threadDetailStream: async function* (): AsyncGenerator<OrchestrationThreadStreamItem> {
      yield await new Promise<OrchestrationThreadStreamItem>(() => undefined)
    },
  }

  return environment
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => online,
  })
}

function dropped() {
  return createClientError({
    code: 'ORCHESTRATION_WS_CLOSED',
    message: 'Shell stream dropped.',
    status: 502,
    why: 'The test shell stream dropped mid-flight.',
    fix: 'Reconnect.',
  })
}

function rejected() {
  return createClientError({
    code: 'ORCHESTRATION_WS_UNAUTHORIZED',
    message: 'Shell socket rejected.',
    status: 401,
    why: 'The test server refused the socket.',
    fix: 'Sign in again.',
  })
}
