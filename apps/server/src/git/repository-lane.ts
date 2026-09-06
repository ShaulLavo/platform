import { AsyncLocalStorage } from 'node:async_hooks'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import type { GitRepositoryRunner } from './service'

const pending = new Map<string, Promise<void>>()
type RepositoryLease = { valid: boolean }
const active = new AsyncLocalStorage<ReadonlyMap<string, RepositoryLease>>()

export function outsideGitRepositoryLane<T>(action: () => T): T {
  return active.run(new Map(), action)
}

export async function gitCommonDirectory(runner: GitRepositoryRunner) {
  const result = await runner.run(['rev-parse', '--git-common-dir'])
  return realpath(path.resolve(runner.rootAbsolutePath, result.stdout.trim()))
}

export async function withGitRepositoryLane<T>(commonDirectory: string, action: () => Promise<T>) {
  if (active.getStore()?.get(commonDirectory)?.valid) return action()

  const previous = pending.get(commonDirectory) ?? Promise.resolve()
  const completion = Promise.withResolvers<void>()
  pending.set(commonDirectory, completion.promise)
  await previous
  const lease = { valid: true }
  try {
    return await active.run(
      new Map([...(active.getStore() ?? []), [commonDirectory, lease]]),
      action,
    )
  } finally {
    lease.valid = false
    completion.resolve()
    if (pending.get(commonDirectory) === completion.promise) pending.delete(commonDirectory)
  }
}

export async function* withGitRepositoryLaneStream<T>(
  commonDirectory: string,
  source: () => AsyncGenerator<T>,
): AsyncGenerator<T> {
  if (active.getStore()?.get(commonDirectory)?.valid) {
    yield* source()
    return
  }
  const previous = pending.get(commonDirectory) ?? Promise.resolve()
  const completion = Promise.withResolvers<void>()
  pending.set(commonDirectory, completion.promise)
  await previous
  const lease = { valid: true }
  const context = new Map([...(active.getStore() ?? []), [commonDirectory, lease]])
  const iterator = active.run(context, source)
  try {
    while (true) {
      const next = await active.run(context, () => iterator.next())
      if (next.done) return
      yield next.value
    }
  } finally {
    await active
      .run(context, () => iterator.return(undefined))
      .finally(() => {
        lease.valid = false
        completion.resolve()
        if (pending.get(commonDirectory) === completion.promise) pending.delete(commonDirectory)
      })
  }
}
