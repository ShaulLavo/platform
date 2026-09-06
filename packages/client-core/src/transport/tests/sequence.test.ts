import * as v from 'valibot'
import { test, expect } from 'vitest'
import { orchestrationShellStreamItemSchema } from '@workspace/contracts'
import { guardOrchestrationStreamSequence } from '../utils/sequence'

test('one operation can deliver different aggregates at the same sequence without delivering duplicates', async () => {
  const sessionId = '11111111-1111-4111-8111-111111111111'
  const worktreeId = '22222222-2222-4222-8222-222222222222'
  const rows = [
    { kind: 'session-removed', sessionId, sequence: 10 },
    { kind: 'worktree-removed', worktreeId, sequence: 10 },
    { kind: 'session-removed', sessionId, sequence: 10 },
    { kind: 'worktree-removed', worktreeId, sequence: 9 },
    { kind: 'session-removed', sessionId, sequence: 11 },
  ].map((row) => v.parse(orchestrationShellStreamItemSchema, row))
  const result = []
  for await (const row of guardOrchestrationStreamSequence(
    (async function* () {
      yield* rows
    })(),
  ))
    result.push(row)
  expect(result).toEqual([rows[0], rows[1], rows[4]])
})
