import type { TurnId } from '@workspace/contracts'
import { noop } from './runtime-ids'

export type ActiveProviderTurn = {
  canonicalTurnId: TurnId
  messageId: string
  promise: Promise<void>
  reject: (error: Error) => void
  resolve: () => void
  settled: () => boolean
}

export function activeProviderTurn(input: {
  canonicalTurnId: TurnId
  messageId: string
}): ActiveProviderTurn {
  let settled = false
  let resolveTurn: () => void = noop
  let rejectTurn: (error: Error) => void = noop
  const promise = new Promise<void>((resolve, reject) => {
    resolveTurn = () => {
      settled = true
      resolve()
    }
    rejectTurn = (error) => {
      settled = true
      reject(error)
    }
  })

  return {
    canonicalTurnId: input.canonicalTurnId,
    messageId: input.messageId,
    promise,
    reject: rejectTurn,
    resolve: resolveTurn,
    settled: () => settled,
  }
}
