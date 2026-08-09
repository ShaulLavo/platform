import type { ProviderSessionStartInput, ProviderTurnInput } from '../../types'

export function sessionInputFromTurn(input: ProviderTurnInput): ProviderSessionStartInput {
  return {
    cwd: input.cwd,
    interactionMode: input.interactionMode,
    modelSelection: input.modelSelection,
    providerInstanceId: input.providerInstanceId,
    runtimeMode: input.runtimeMode,
    threadId: input.thread.id,
  }
}
