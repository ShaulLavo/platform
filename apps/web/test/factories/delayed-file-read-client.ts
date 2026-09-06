import { treaty } from '@elysia/eden'
import type { App } from 'server/client-contract'

import { activeServerOrigin, getClient, setClient } from '@/lib/client'
import { clientInstanceId, instanceHeaderName } from '@/lib/instance-id'

export type DelayedFileReadClient = {
  readonly observedStatus: () => number | null
  readonly release: () => void
  readonly restore: () => void
}

export function installDelayedFileReadClient(): DelayedFileReadClient {
  const previousClient = getClient()
  const gate = createDelayedReadGate()
  const fetcher = Object.assign(
    async (...args: Parameters<typeof fetch>) => {
      const response = await fetch(...args)
      if (new URL(requestUrl(args[0])).pathname !== '/fs/read') return response

      await gate.hold(response.status)
      return response
    },
    { preconnect: fetch.preconnect },
  )
  setClient(
    treaty<App>(activeServerOrigin(), {
      fetcher,
      headers: () => ({ [instanceHeaderName]: clientInstanceId() }),
    }),
  )

  let restored = false
  return {
    observedStatus: gate.observedStatus,
    release: gate.release,
    restore: () => {
      gate.release()
      if (restored) return

      restored = true
      setClient(previousClient)
    },
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function createDelayedReadGate() {
  let observedStatus: number | null = null
  let released = false
  let releaseWait: () => void = () => undefined
  const wait = new Promise<void>((resolve) => {
    releaseWait = resolve
  })

  return {
    hold: (status: number) => {
      observedStatus = status
      return wait
    },
    observedStatus: () => observedStatus,
    release: () => {
      if (released) return

      released = true
      releaseWait()
    },
  }
}
