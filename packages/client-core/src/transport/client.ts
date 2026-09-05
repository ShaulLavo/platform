import { treaty } from '@elysia/eden'
import type { App } from 'server/client-contract'

export type Client = ReturnType<typeof treaty<App>>

export type EnvironmentClientOptions = {
  readonly origin: string
  readonly headers?: () => Record<string, string>
  readonly fetcher?: typeof fetch
}

export function createEnvironmentClient({
  origin,
  headers,
  fetcher,
}: EnvironmentClientOptions): Client {
  // Settings and identifiers can contain date-shaped strings that must stay literal.
  return treaty<App>(canonicalServerOrigin(origin), { headers, fetcher, parseDate: false })
}

export function canonicalServerOrigin(origin: string): string {
  const url = new URL(origin)
  return `${url.origin}${url.pathname.replace(/\/+$/u, '')}`
}
