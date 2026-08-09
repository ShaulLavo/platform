import { queryOptions } from '@tanstack/react-query'
import type { ProviderInstanceId, ProviderSignInMethod } from '@workspace/contracts'

import { getClient } from '@/lib/client'
import { createRpcError } from '@/lib/structured-errors'

const AUTH_STATUS_STALE_TIME_MS = 15_000
const LOGIN_POLL_INTERVAL_MS = 1_000

export const providerAuthKeys = {
  all: ['providers', 'auth'] as const,
  attempt: (providerInstanceId: ProviderInstanceId, attemptId: string) =>
    [...providerAuthKeys.all, providerInstanceId, 'attempt', attemptId] as const,
  status: (providerInstanceId: ProviderInstanceId) =>
    [...providerAuthKeys.all, providerInstanceId] as const,
}

function unwrap<Data>(response: { data: Data | null; error: unknown }): Data {
  if (response.error) throw createRpcError(response.error)

  return response.data as Data
}

function authRoutes(providerInstanceId: ProviderInstanceId) {
  return getClient().providers({ providerInstanceId }).auth
}

/** Answers for every provider: the ones with no in-app flow report `supportsSignIn: false`. */
export async function fetchProviderAuth(providerInstanceId: ProviderInstanceId) {
  return unwrap(await authRoutes(providerInstanceId).get())
}

export async function startProviderLogin(
  providerInstanceId: ProviderInstanceId,
  method: ProviderSignInMethod,
) {
  return unwrap(await authRoutes(providerInstanceId).login.post({ method }))
}

export async function fetchProviderLoginAttempt(
  providerInstanceId: ProviderInstanceId,
  attemptId: string,
) {
  return unwrap(await authRoutes(providerInstanceId).login({ attemptId }).get())
}

// Cancel is a POST, not a DELETE: the server allows GET/POST/OPTIONS only, so a
// DELETE from the browser would die in CORS preflight.
export async function cancelProviderLoginAttempt(
  providerInstanceId: ProviderInstanceId,
  attemptId: string,
) {
  return unwrap(await authRoutes(providerInstanceId).login({ attemptId }).cancel.post())
}

export async function signOutProvider(providerInstanceId: ProviderInstanceId) {
  return unwrap(await authRoutes(providerInstanceId).logout.post())
}

export function providerAuthQueryOptions(providerInstanceId: ProviderInstanceId, enabled: boolean) {
  return queryOptions({
    enabled,
    queryFn: () => fetchProviderAuth(providerInstanceId),
    queryKey: providerAuthKeys.status(providerInstanceId),
    refetchOnWindowFocus: false,
    staleTime: AUTH_STATUS_STALE_TIME_MS,
  })
}

// The attempt finishes out-of-band in a browser tab, so polling is the only way
// to learn it landed. Polling stops the moment the attempt leaves `pending`.
export function providerLoginAttemptQueryOptions(
  providerInstanceId: ProviderInstanceId,
  attemptId: string | null,
) {
  return queryOptions({
    enabled: attemptId !== null,
    queryFn: () => fetchProviderLoginAttempt(providerInstanceId, attemptId ?? ''),
    queryKey: providerAuthKeys.attempt(providerInstanceId, attemptId ?? 'none'),
    refetchInterval: (query) =>
      query.state.data?.state === 'pending' ? LOGIN_POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  })
}
