import { turnIdSchema, type TurnId } from '@workspace/contracts'
import * as v from 'valibot'

export function parseOptionalTurnId(value: string | null) {
  if (!value) return undefined

  return v.parse(turnIdSchema, value)
}

export function canonicalTurnId(
  turnIds: Map<string, TurnId>,
  providerTurnId: string | undefined,
): TurnId | undefined {
  if (!providerTurnId) return undefined

  return turnIds.get(providerTurnId)
}
