import { ChildProcess } from 'node:child_process'
import { expect, it, vi } from 'vitest'
import { ProviderProcessLifetime } from '../process-lifetime'

it('keeps ownership through kill requests and timeout until an actual exit event', async () => {
  const child = new ChildProcess()
  const signals: Array<NodeJS.Signals | number | undefined> = []
  child.kill = (signal) => {
    signals.push(signal)
    return true
  }
  const lifetime = new ProviderProcessLifetime(child)
  vi.useFakeTimers()
  try {
    const stopping = expect(lifetime.close()).rejects.toThrow(
      'Provider process exit was not acknowledged.',
    )
    expect(signals).toEqual(['SIGTERM'])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(signals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(lifetime.isAlive()).toBe(true)
    await vi.advanceTimersByTimeAsync(4_000)
    await stopping
    expect(lifetime.isAlive()).toBe(true)
    child.emit('exit', 0, null)
    await lifetime.close()
    expect(lifetime.isAlive()).toBe(false)
  } finally {
    vi.useRealTimers()
  }
})
