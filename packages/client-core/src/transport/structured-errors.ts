import { createClientError } from '../errors'

export function createOrchestrationRpcClosedError() {
  return createClientError({
    code: 'ORCHESTRATION_RPC_CLOSED',
    message: 'The chat transport is closed.',
    status: 499,
    why: 'The owner released this environment connection.',
    fix: 'Use the current chat transport to start another operation.',
  })
}
