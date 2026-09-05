import { errorNumberField, errorStringField } from '@workspace/contracts'
import { createClientError } from '../errors'

export function rpcErrorPayload(error: unknown): unknown {
  if (!error || typeof error !== 'object') return error
  const container = 'value' in error ? error.value : error
  if (!container || typeof container !== 'object') return container
  return 'error' in container ? container.error : container
}

export function createRpcError(error: unknown) {
  const payload = rpcErrorPayload(error)
  return createClientError({
    cause: error,
    code: errorStringField(payload, 'code') ?? 'client.RPC_FAILED',
    message: errorStringField(payload, 'message') ?? 'Remote procedure call failed.',
    status: errorNumberField(error, 'status') ?? errorNumberField(payload, 'status') ?? 502,
    why: errorStringField(payload, 'why') ?? 'The server returned an error response.',
    fix:
      errorStringField(payload, 'fix') ??
      'Inspect the server error and retry once the issue is resolved.',
  })
}
