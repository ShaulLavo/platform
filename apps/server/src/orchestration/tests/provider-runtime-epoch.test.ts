import { pendingProviderTurnFailure } from '../../../test/factories/provider-launch'
import { expect, onTestFinished, test } from 'vitest'
import * as v from 'valibot'
import { providerInstanceIdSchema, sessionIdSchema } from '@workspace/contracts'
import {
  createOrchestrationFixture,
  FIXTURE_SESSION_ID,
  sessionFrom,
} from '../../../test/factories/orchestration'
import { ProviderRuntimeIngestion } from '../provider-runtime-ingestion'

const at = '2026-09-05T12:00:00.000Z'

test('a provider callback accepted before a new claim cannot commit into the new runtime epoch', async () => {
  const fixture = await createOrchestrationFixture()
  const accepted = Promise.withResolvers<void>()
  const resumeDispatch = Promise.withResolvers<void>()
  try {
    const registration = await fixture.register()
    if (!registration.result) throw new TypeError('Missing worktree registration')
    await fixture.createSession(registration.result.worktreeId)
    await fixture.command({
      type: 'session.runtime.set',
      commandId: 'initial-runtime',
      sessionId: FIXTURE_SESSION_ID,
      createdAt: at,
      runtime: {
        sessionId: FIXTURE_SESSION_ID,
        providerInstanceId: 'codex',
        providerName: 'Codex',
        providerDriverKind: 'codex',
        providerBindingHandle: null,
        providerResumeCursor: null,
        providerConversationMarker: null,
        runtimeEpoch: 'old',
        status: 'idle',
        runtimeMode: 'full-access',
        activeTurnId: null,
        lastError: null,
        updatedAt: at,
      },
    })
    let model = await fixture.engine.readModelSnapshot()
    const initialRuntime = (await sessionFrom(fixture)).runtime
    const ingestion = new ProviderRuntimeIngestion(
      async (command, source) => {
        accepted.resolve()
        await resumeDispatch.promise
        return fixture.engine.dispatchProviderCommand(command, source)
      },
      { getReadModel: () => model },
    )
    const event = {
      type: 'runtime.started' as const,
      eventId: 'old-callback',
      runtimeEpoch: 'old',
      payload: {},
      sessionId: v.parse(sessionIdSchema, FIXTURE_SESSION_ID),
      providerInstanceId: v.parse(providerInstanceIdSchema, 'codex'),
      providerDriverKind: 'codex' as const,
      createdAt: at,
    }
    const oldCallback = ingestion.ingest(event)
    await accepted.promise
    await fixture.startTurn()
    const turn = (await sessionFrom(fixture)).latestTurn
    if (!turn) throw new TypeError('Missing queued turn')
    const claimed = await fixture.command({
      type: 'session.provider-start.claim',
      commandId: 'new-runtime-claim',
      sessionId: FIXTURE_SESSION_ID,
      turnId: turn.turnId,
      observedSequence: turn.providerStartSequence,
      generation: 1,
      runtimeEpoch: 'new',
      createdAt: at,
    })
    model = await fixture.engine.readModelSnapshot()
    resumeDispatch.resolve()
    await oldCallback

    const afterOldCallback = await sessionFrom(fixture)
    expect(afterOldCallback.latestTurn?.runtimeEpoch).toBe('new')
    expect(afterOldCallback.runtime).toEqual(initialRuntime)
    expect((await fixture.engine.shellSnapshot()).snapshotSequence).toBe(claimed.sequence)

    await ingestion.ingest({ ...event, eventId: 'new-callback', runtimeEpoch: 'new' })
    expect((await sessionFrom(fixture)).runtime).toMatchObject({
      runtimeEpoch: 'new',
      status: 'running',
    })
  } finally {
    resumeDispatch.resolve()
    await fixture.close()
  }
})

test('a delayed failure from an interrupted send cannot stamp the next runtime with an error', async () => {
  const { fixture, adapter, failOldTurn } = await pendingProviderTurnFailure()
  const oldEpoch = (await sessionFrom(fixture)).latestTurn?.runtimeEpoch
  expect(oldEpoch).toEqual(expect.any(String))
  const interrupted = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()
  const unsubscribe = fixture.engine.subscribeDomainEvents({
    name: 'runtime-epoch-test',
    handleEvents: (events) => {
      for (const event of events) {
        if (event.type !== 'session.runtime-set') continue
        const runtime = event.payload.runtime
        if (runtime.status === 'interrupted') interrupted.resolve()
        if (runtime.runtimeEpoch !== oldEpoch && runtime.status === 'ready') completed.resolve()
      }
    },
  })
  onTestFinished(unsubscribe)
  await fixture.command({
    type: 'session.turn.interrupt',
    commandId: 'interrupt-old-send',
    sessionId: FIXTURE_SESSION_ID,
    turnId: 'turn-1',
  })
  await interrupted.promise
  await fixture.command({
    type: 'session.settle',
    commandId: 'acknowledge-old-interruption',
    sessionId: FIXTURE_SESSION_ID,
  })
  await fixture.startTurn(FIXTURE_SESSION_ID, 'next-turn')
  await completed.promise
  const beforeLateFailure = await sessionFrom(fixture)
  expect((await fixture.engine.shellSnapshot()).sessions[0]?.hasError).toBe(false)
  expect(beforeLateFailure.latestTurn).toMatchObject({ turnId: 'next-turn', state: 'completed' })
  expect(beforeLateFailure.latestTurn?.runtimeEpoch).not.toBe(oldEpoch)
  expect(beforeLateFailure.runtime).toMatchObject({ status: 'ready', lastError: null })

  failOldTurn()
  await fixture.engine.providerRuntimeIdle()

  const afterLateFailure = await sessionFrom(fixture)
  expect(adapter.startedTurns).toHaveLength(2)
  expect(afterLateFailure.runtime).toEqual(beforeLateFailure.runtime)
  expect(afterLateFailure.latestTurn).toEqual(beforeLateFailure.latestTurn)
  expect(
    afterLateFailure.activities.some((activity) => activity.kind === 'provider.turn.start.failed'),
  ).toBe(false)
  expect(
    afterLateFailure.activities
      .filter((activity) => activity.tone === 'error')
      .map((activity) => ({
        kind: activity.kind,
        summary: activity.summary,
        payload: activity.payload,
      })),
  ).toEqual([])
  expect((await fixture.engine.shellSnapshot()).sessions[0]).toMatchObject({
    hasError: false,
    attentionState: 'settled',
  })
})
