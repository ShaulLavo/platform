import type { EnvironmentId } from '@workspace/contracts'
import { canonicalServerOrigin } from '@workspace/client-core/transport/client'
import {
  createEnvironmentIdentityDriftError,
  createEnvironmentProtocolMismatchError,
} from '@workspace/client-core/environments/utils/structured-errors'
import { selectServerConnection } from '@workspace/client-core/environments/state/store'
import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { createClientInvariantError } from '@/lib/structured-errors'

export function confirmedEnvironmentId(origin: string): EnvironmentId {
  origin = canonicalServerOrigin(origin)
  assertAcceptedOrigin(origin)
  const id = useEnvironmentsStore.getState().entries[origin]?.environmentId
  if (id) return id
  throw createClientInvariantError('The machine identity has not been confirmed.')
}

export function activeEnvironmentId(): EnvironmentId {
  return confirmedEnvironmentId(useEnvironmentsStore.getState().activeOrigin)
}

export function confirmedEnvironmentOrigin(environmentId: EnvironmentId): string {
  const entry = Object.values(useEnvironmentsStore.getState().entries).find(
    (entry) => entry.environmentId === environmentId,
  )
  if (entry) {
    assertAcceptedOrigin(entry.origin)
    return entry.origin
  }
  throw createClientInvariantError('The session belongs to an unknown machine.')
}

function assertAcceptedOrigin(origin: string) {
  const connection = selectServerConnection(useEnvironmentsStore.getState(), origin)
  if (connection.phase === 'identity-drift') {
    throw createEnvironmentIdentityDriftError(origin, connection.expected, connection.received)
  }
  if (connection.phase === 'protocol-mismatch') {
    throw createEnvironmentProtocolMismatchError(origin, connection.expected, connection.received)
  }
}
