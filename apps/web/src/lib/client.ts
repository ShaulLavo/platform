import { treaty } from '@elysia/eden'

import type { App } from 'server/client-contract'

import { clientInstanceId, instanceHeaderName } from '@/lib/instance-id'

const defaultServerUrl = 'http://localhost:3001'

export type Client = ReturnType<typeof treaty<App>>

let selectedOrigin = canonicalServerOrigin(import.meta.env.VITE_SERVER_URL ?? defaultServerUrl)
const clients = new Map<string, Client>()

export function createEnvironmentClient(origin: string): Client {
  return treaty<App>(canonicalServerOrigin(origin), {
    headers: () => ({ [instanceHeaderName]: clientInstanceId() }),
  })
}

export function activeServerOrigin(): string {
  return selectedOrigin
}

export function setActiveServerOrigin(origin: string): void {
  selectedOrigin = canonicalServerOrigin(origin)
}

export function environmentClientFor(origin: string): Client {
  origin = canonicalServerOrigin(origin)
  const existing = clients.get(origin)
  if (existing) return existing

  const client = createEnvironmentClient(origin)
  clients.set(origin, client)
  return client
}

export function getClient(): Client {
  return environmentClientFor(selectedOrigin)
}

export function setClient(client: Client) {
  clients.set(selectedOrigin, client)
}

export function canonicalServerOrigin(origin: string): string {
  return new URL(origin).origin
}
