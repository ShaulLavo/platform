import { createEndpointClient } from '@/lib/environments/state/endpoint-client'
import {
  canonicalServerOrigin,
  createEnvironmentClient,
  type Client,
} from '@workspace/client-core/transport/client'

import { clientInstanceId, instanceHeaderName } from '@/lib/instance-id'

const defaultServerUrl = 'http://localhost:3001'

export type { Client }

const primaryOrigin = canonicalServerOrigin(import.meta.env.VITE_SERVER_URL ?? defaultServerUrl)
let selectedOrigin = primaryOrigin
const endpoints = new Map<string, string>()
const clients = new Map<string, Client>()
const clientOrigins = new WeakMap<Client, string>()

export function primaryServerOrigin(): string {
  return primaryOrigin
}

export function serverEndpoint(origin: string): string {
  origin = canonicalServerOrigin(origin)
  return endpoints.get(origin) ?? origin
}

export function replaceEnvironmentEndpoint(owner: string, endpoint: string): void {
  endpoints.set(canonicalServerOrigin(owner), canonicalServerOrigin(endpoint))
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

  const client = createEndpointClient({
    origin,
    resolveEndpoint: serverEndpoint,
    createClient: (endpoint) =>
      createEnvironmentClient({
        origin: endpoint,
        headers: () => ({ [instanceHeaderName]: clientInstanceId() }),
      }),
  })
  clients.set(origin, client)
  clientOrigins.set(client, origin)
  return client
}

export function getClient(): Client {
  return environmentClientFor(selectedOrigin)
}

export function setClient(client: Client) {
  clients.set(selectedOrigin, client)
  clientOrigins.set(client, selectedOrigin)
}

export function originForClient(client: Client): string | null {
  return clientOrigins.get(client) ?? null
}
