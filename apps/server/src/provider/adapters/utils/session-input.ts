import type { ProviderSessionStartInput, ProviderTurnInput } from '../../types'

export function sessionInputFromTurn(input: ProviderTurnInput): ProviderSessionStartInput {
  return {
    cwd: input.cwd,
    ephemeral: input.ephemeral,
    interactionMode: input.interactionMode,
    modelSelection: input.modelSelection,
    providerInstanceId: input.providerInstanceId,
    resumeCursor: input.resumeCursor ?? null,
    runtimeMode: input.runtimeMode,
    threadId: input.thread.id,
  }
}
