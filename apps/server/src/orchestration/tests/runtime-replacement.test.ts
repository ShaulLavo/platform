import { expect, onTestFinished, test } from 'vitest'
import {
  createOrchestrationFixture,
  FIXTURE_SESSION_ID,
  mockRuntime,
  sessionFrom,
} from '../../../test/factories/orchestration'
import { MockProviderAdapter } from '../../provider/adapters/mock'

test.each(['runtime mode', 'model'] as const)(
  '%s replacement gets a fresh process epoch on the next turn',
  async (preference) => {
    const fixture = await createOrchestrationFixture()
    onTestFinished(() => fixture.close())
    const adapter = new MockProviderAdapter()
    const registration = await fixture.register()
    expect(registration.result).not.toBeNull()
    await fixture.createSession(registration.result!.worktreeId)
    await fixture.restart(mockRuntime(adapter))
    await fixture.startTurn()
    await fixture.engine.providerRuntimeIdle()
    const first = adapter.startedSessions[0]!
    const changedMode = first.runtimeMode === 'full-access' ? 'approval-required' : 'full-access'
    const runtimeMode = preference === 'runtime mode' ? changedMode : first.runtimeMode
    const modelSelection =
      preference === 'model'
        ? { ...first.modelSelection, model: 'replacement-model' }
        : first.modelSelection

    if (preference === 'runtime mode') {
      await fixture.command({
        type: 'session.runtime-mode.set',
        commandId: 'change-runtime-preference',
        sessionId: FIXTURE_SESSION_ID,
        runtimeMode,
      })
      await fixture.engine.providerRuntimeIdle()
      expect((await sessionFrom(fixture)).runtimeMode).toBe(runtimeMode)
    }
    expect(adapter.startedSessions).toHaveLength(1)
    await fixture.command({
      type: 'session.turn.start',
      commandId: 'turn-after-preference',
      sessionId: FIXTURE_SESSION_ID,
      turnId: 'turn-replacement',
      runtimeMode,
      modelSelection,
      message: { messageId: 'replacement-request', role: 'user', text: 'Use the new preference' },
    })
    await fixture.engine.providerRuntimeIdle()

    expect(adapter.startedSessions).toHaveLength(2)
    const replacement = adapter.startedSessions[1]!
    expect(replacement.runtimeEpoch).not.toBe(first.runtimeEpoch)
    expect((await sessionFrom(fixture)).runtime).toMatchObject({
      runtimeEpoch: replacement.runtimeEpoch,
      runtimeMode,
    })
    expect((await sessionFrom(fixture)).modelSelection).toEqual(modelSelection)
    expect(adapter.startedTurns.at(-1)).toMatchObject({ runtimeMode, modelSelection })
  },
)
