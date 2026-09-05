import { afterEach, beforeEach, vi } from 'vitest'
import { expect, test } from '../../../test/fixtures'
import { createEnvironmentRecovery } from '@/state/environment-recovery'

const cleanups: (() => void)[] = []

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.useRealTimers()
})

test('each machine climbs its own retry ladder and successful recovery clears only its owner', async () => {
  const retry = vi.fn(async (_name: string) => undefined)
  const recovery = createEnvironmentRecovery(retry)
  cleanups.push(recovery.dispose)
  recovery.schedule('alpha')
  recovery.schedule('beta')
  await vi.advanceTimersByTimeAsync(250)
  expect(retry.mock.calls).toEqual([['alpha'], ['beta']])
  recovery.forget('alpha')
  recovery.schedule('beta')
  await vi.advanceTimersByTimeAsync(499)
  expect(retry).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(retry.mock.calls.at(-1)).toEqual(['beta'])
  recovery.forget('beta')
  window.dispatchEvent(new Event('focus'))
  expect(retry).toHaveBeenCalledTimes(3)
})

test('identity drift cancels an existing timer and stays blocked across every automatic wake', async () => {
  const retry = vi.fn(async (_name: string) => undefined)
  const recovery = createEnvironmentRecovery(retry)
  cleanups.push(recovery.dispose)
  recovery.schedule('drifted')
  recovery.schedule('drifted', true)
  recovery.schedule('unreachable')
  window.dispatchEvent(new Event('online'))
  window.dispatchEvent(new Event('focus'))
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(30_000)
  expect(retry.mock.calls.length).toBeGreaterThan(0)
  expect(retry.mock.calls.every(([name]) => name === 'unreachable')).toBe(true)
})

test('dispose releases wake listeners and timers and refuses late retries', async () => {
  const retry = vi.fn(async (_name: string) => undefined)
  const recovery = createEnvironmentRecovery(retry)
  recovery.schedule('alpha')
  recovery.dispose()
  recovery.schedule('late')
  window.dispatchEvent(new Event('focus'))
  window.dispatchEvent(new Event('online'))
  await vi.advanceTimersByTimeAsync(30_000)
  expect(retry).not.toHaveBeenCalled()
})
