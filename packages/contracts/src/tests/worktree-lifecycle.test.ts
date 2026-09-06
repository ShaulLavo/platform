import { expect, test } from 'vitest'
import * as v from 'valibot'
import {
  clientOrchestrationCommandSchema,
  orchestrationCommandSchema,
} from '../orchestration-commands'
import { sessionWorktreeTargetSchema, worktreeLifecycleSchema } from '../worktree-lifecycle'

const worktreeId = '726f8c4f-1e16-4f4b-95bd-c57f19746772'
const baseWorktreeId = 'c5efcf85-f0ea-4e14-8dd5-8b0b09ebddee'

test('creation targets contain validated IDs and reject filesystem or branch predictions', () => {
  expect(v.parse(sessionWorktreeTargetSchema, { kind: 'new', worktreeId, baseWorktreeId })).toEqual(
    { kind: 'new', worktreeId, baseWorktreeId },
  )
  for (const extra of [
    { path: '/tmp/predicted' },
    { branch: 'feature' },
    { requestWorktree: true },
  ])
    expect(
      v.safeParse(sessionWorktreeTargetSchema, { kind: 'current', worktreeId, ...extra }).success,
    ).toBe(false)
  expect(
    v.safeParse(sessionWorktreeTargetSchema, {
      kind: 'new',
      worktreeId: '../escape',
      baseWorktreeId,
    }).success,
  ).toBe(false)
})

test('force cleanup is a distinct command with durable authorization', () => {
  const command = { type: 'worktree.force-cleanup', commandId: 'force', worktreeId }
  expect(v.safeParse(clientOrchestrationCommandSchema, command).success).toBe(false)
  expect(
    v.safeParse(clientOrchestrationCommandSchema, {
      ...command,
      authorization: { expectedHead: 'a'.repeat(40), expectedStatusFingerprint: 'confirmed-state' },
    }).success,
  ).toBe(true)
  expect(v.safeParse(clientOrchestrationCommandSchema, { ...command, force: true }).success).toBe(
    false,
  )
})

test('only dirty cleanup blockers carry a changed file count', () => {
  const common = { state: 'cleanup-blocked', operationId: 'cleanup' }
  expect(
    v.safeParse(worktreeLifecycleSchema, { ...common, reason: 'dirty', changedFileCount: 3 })
      .success,
  ).toBe(true)
  expect(
    v.safeParse(worktreeLifecycleSchema, { ...common, reason: 'dirty', changedFileCount: null })
      .success,
  ).toBe(false)
  expect(
    v.safeParse(worktreeLifecycleSchema, {
      ...common,
      reason: 'active-terminal',
      changedFileCount: 3,
    }).success,
  ).toBe(false)
  expect(
    v.safeParse(worktreeLifecycleSchema, {
      ...common,
      reason: 'active-terminal',
      changedFileCount: null,
    }).success,
  ).toBe(true)
})

test('clients cannot forge prepared observations or terminal process acknowledgements', () => {
  const retain = { type: 'worktree.retain', commandId: 'retain', worktreeId }
  expect(v.safeParse(clientOrchestrationCommandSchema, retain).success).toBe(true)
  expect(v.safeParse(clientOrchestrationCommandSchema, { ...retain, verified: true }).success).toBe(
    false,
  )
  expect(v.safeParse(orchestrationCommandSchema, retain).success).toBe(false)
  expect(v.safeParse(orchestrationCommandSchema, { ...retain, verified: true }).success).toBe(true)
  expect(
    v.safeParse(clientOrchestrationCommandSchema, {
      type: 'terminal.lease.end',
      commandId: 'end',
      worktreeId,
      terminalLeaseId: baseWorktreeId,
      runtimeEpoch: 'epoch',
    }).success,
  ).toBe(false)
})
