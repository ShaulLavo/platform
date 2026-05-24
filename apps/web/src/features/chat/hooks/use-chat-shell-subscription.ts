import { useEffect, useState } from 'react'

import type { ChatEnvironment } from '../environment/chat-environment'
import { useChatProjectionStore } from '../state/chat-projection-store'

const SHELL_RECONNECT_DELAY_MS = 1_200

export type ChatShellSubscriptionState = {
  error: string | null
  status: 'connecting' | 'error' | 'live'
}

export function useChatShellSubscription(environment: ChatEnvironment): ChatShellSubscriptionState {
  const [state, setState] = useState<ChatShellSubscriptionState>({
    error: null,
    status: 'connecting',
  })

  useEffect(() => {
    const abortController = new AbortController()

    void runShellSubscription(environment, abortController.signal, setState)

    return () => abortController.abort()
  }, [environment])

  return state
}

async function runShellSubscription(
  environment: ChatEnvironment,
  signal: AbortSignal,
  setState: (state: ChatShellSubscriptionState) => void,
) {
  while (!signal.aborted) {
    await subscribeShellOnce(environment, signal, setState)
    await reconnectDelay(signal)
  }
}

async function subscribeShellOnce(
  environment: ChatEnvironment,
  signal: AbortSignal,
  setState: (state: ChatShellSubscriptionState) => void,
) {
  try {
    setState({ error: null, status: 'connecting' })
    await applyShellStream(environment, signal, setState)
  } catch (error) {
    if (signal.aborted) return

    setState({ error: chatErrorMessage(error), status: 'error' })
  }
}

async function applyShellStream(
  environment: ChatEnvironment,
  signal: AbortSignal,
  setState: (state: ChatShellSubscriptionState) => void,
) {
  const afterSequence = useChatProjectionStore.getState().lastAppliedShellSequence

  for await (const item of environment.shellStream({ afterSequence, signal })) {
    useChatProjectionStore.getState().applyShellStreamItem(item)
    setState({ error: null, status: 'live' })
  }
}

async function reconnectDelay(signal: AbortSignal) {
  if (signal.aborted) return

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, SHELL_RECONNECT_DELAY_MS)

    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout)
        resolve()
      },
      { once: true },
    )
  })
}

function chatErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return 'Chat connection failed.'
}
