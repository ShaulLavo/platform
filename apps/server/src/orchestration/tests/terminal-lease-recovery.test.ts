import { afterEach, expect, it } from 'vitest'
import { createOrchestrationFixture } from '../../../test/factories/orchestration'
import { requireWorktree } from '../read-model'

const fixtures: Awaited<ReturnType<typeof createOrchestrationFixture>>[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()))
})

it('ends unclaimed requests and preserves unknown ownership for every claimed stale epoch', async () => {
  const fixture = await createOrchestrationFixture()
  fixtures.push(fixture)
  const result = (await fixture.register()).result
  if (!result) throw new TypeError('Missing registered worktree')
  const worktreeId = result.worktreeId
  const states = ['requested', 'claimed', 'active', 'termination-requested'] as const
  for (const [index, state] of states.entries()) {
    const terminalLeaseId = `10000000-0000-4000-8000-00000000000${index + 1}`
    const shared = { worktreeId, terminalLeaseId, runtimeEpoch: 'stale-runtime' }
    await fixture.command({
      ...shared,
      type: 'terminal.lease.request',
      commandId: `request-${index}`,
    })
    if (state === 'requested') continue
    await fixture.command({ ...shared, type: 'terminal.lease.claim', commandId: `claim-${index}` })
    if (state === 'claimed') continue
    await fixture.command({
      ...shared,
      type: 'terminal.lease.activate',
      commandId: `active-${index}`,
    })
    if (state === 'active') continue
    await fixture.command({
      ...shared,
      type: 'terminal.lease.terminate',
      commandId: `terminate-${index}`,
    })
  }
  const restarted = await fixture.restart()
  const model = await restarted.readModelSnapshot()
  expect([...model.terminalLeases.values()].map((lease) => lease.state)).toEqual([
    'ended',
    'ownership-unknown',
    'ownership-unknown',
    'ownership-unknown',
  ])
  expect(requireWorktree(model, worktreeId)).toMatchObject({
    activeTerminalCount: 0,
    terminalOwnershipUnknown: true,
  })
  await fixture.restart()
  expect(
    requireWorktree(await fixture.engine.readModelSnapshot(), worktreeId).terminalOwnershipUnknown,
  ).toBe(true)
})
