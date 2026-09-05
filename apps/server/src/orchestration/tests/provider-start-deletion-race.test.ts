import { expect, test } from 'vitest'
import * as v from 'valibot'
import { sessionIdSchema } from '@workspace/contracts'
import { FIXTURE_SESSION_ID, sessionFrom } from '../../../test/factories/orchestration'
import { pendingProviderLaunch } from '../../../test/factories/provider-launch'

test('deleting during provider launch releases the eventual runtime before cleanup completes', async () => {
  const { fixture, adapter, release } = await pendingProviderLaunch()

  await fixture.command({
    type: 'session.delete',
    commandId: 'delete-during-launch',
    sessionId: FIXTURE_SESSION_ID,
  })
  const deleted = Promise.withResolvers<void>()
  const unsubscribe = fixture.engine.subscribeDomainEvents({
    name: 'observe-cleanup-attempt',
    handleEvents: (events) => {
      if (events.some((event) => event.type === 'session.deletion-updated')) deleted.resolve()
    },
  })
  // A launch may be fenced by the cleanup owner; release without waiting for its terminal verdict.
  await Promise.race([deleted.promise, new Promise((resolve) => setTimeout(resolve, 20))])
  unsubscribe()
  release()
  await fixture.engine.providerRuntimeIdle()

  expect(adapter.startedTurns).toHaveLength(0)
  expect(
    await adapter.hasRuntime({ sessionId: v.parse(sessionIdSchema, FIXTURE_SESSION_ID) }),
  ).toBe(false)
  expect((await sessionFrom(fixture)).deletion).toMatchObject({ blobCleanup: 'completed' })
  expect(['completed', 'no-binding']).toContain((await sessionFrom(fixture)).deletion?.providerStop)
})

test('interrupting during launch never sends the old prompt or interrupts a newer queued prompt', async () => {
  const { fixture, adapter, release } = await pendingProviderLaunch()
  await fixture.command({
    type: 'session.turn.interrupt',
    commandId: 'interrupt-during-launch',
    sessionId: FIXTURE_SESSION_ID,
    turnId: 'turn-1',
  })
  await fixture.startTurn(FIXTURE_SESSION_ID, 'turn-new')
  release()
  await fixture.engine.providerRuntimeIdle()
  expect(adapter.startedTurns.map((turn) => turn.turnId)).toEqual(['turn-new'])
  expect((await sessionFrom(fixture)).latestTurn).toMatchObject({
    turnId: 'turn-new',
    state: 'completed',
    providerStartState: 'settled',
  })
})
