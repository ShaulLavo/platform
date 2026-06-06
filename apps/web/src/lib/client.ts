import { treaty } from '@elysia/eden'

import type { App } from 'server/client-contract'

const defaultServerUrl = 'http://localhost:3001'

export const serverUrl = import.meta.env.VITE_SERVER_URL ?? defaultServerUrl

export type Client = ReturnType<typeof treaty<App>>

const productionClient: Client = treaty<App>(serverUrl)

// The app talks to the server through this single holder. Tests point it at a
// real in-process server via `setClient`, so production code stays untouched
// and nothing mocks the RPC surface.
let activeClient: Client = productionClient

export function getClient(): Client {
  return activeClient
}

export function setClient(client: Client) {
  activeClient = client
}

export function resetClient() {
  activeClient = productionClient
}
