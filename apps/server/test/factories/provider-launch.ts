import { expect, onTestFinished } from 'vitest'
import { createOrchestrationFixture, mockRuntime } from './orchestration'
import { createInternalError } from '../../src/observability/structured-errors'
import { MockProviderAdapter } from '../../src/provider/adapters/mock'

export async function pendingProviderLaunch() {
  const fixture = await createOrchestrationFixture()
  const adapter = new MockProviderAdapter()
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const originalStart = adapter.startRuntime.bind(adapter)
  adapter.startRuntime = async (input) => {
    started.resolve()
    await release.promise
    return originalStart(input)
  }
  onTestFinished(async () => {
    release.resolve()
    await fixture.engine.providerRuntimeIdle()
    await fixture.close()
  })
  const registration = await fixture.register()
  expect(registration.result).not.toBeNull()
  await fixture.createSession(registration.result!.worktreeId)
  await fixture.restart(mockRuntime(adapter))
  await fixture.startTurn()
  await started.promise
  return { fixture, adapter, release: () => release.resolve() }
}

export async function pendingProviderTurnFailure() {
  const fixture = await createOrchestrationFixture()
  const started = Promise.withResolvers<void>()
  const fail = Promise.withResolvers<void>()
  const adapter = new MockProviderAdapter({
    beforeComplete: async () => {
      if (adapter.startedTurns.length !== 1) return
      started.resolve()
      await fail.promise
      throw createInternalError('Delayed old provider failure')
    },
  })
  onTestFinished(async () => {
    fail.resolve()
    await fixture.engine.providerRuntimeIdle()
    await fixture.close()
  })
  const registration = await fixture.register()
  expect(registration.result).not.toBeNull()
  await fixture.createSession(registration.result!.worktreeId)
  await fixture.restart(mockRuntime(adapter))
  await fixture.startTurn()
  await started.promise
  return { fixture, adapter, failOldTurn: () => fail.resolve() }
}
