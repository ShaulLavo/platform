import { expect, it } from 'vitest'
import {
  outsideGitRepositoryLane,
  withGitRepositoryLane,
  withGitRepositoryLaneStream,
} from '../repository-lane'

it('invalidates inherited lease scopes after their owner returns', async () => {
  const resume = Promise.withResolvers<void>()
  const held = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const order: string[] = []
  let descendant = Promise.resolve()
  await withGitRepositoryLane('/repo', async () => {
    descendant = resume.promise.then(() =>
      withGitRepositoryLane('/repo', async () => {
        order.push('descendant')
      }),
    )
    await withGitRepositoryLane('/repo', async () => {
      order.push('nested')
    })
  })
  const next = withGitRepositoryLane('/repo', async () => {
    held.resolve()
    await release.promise
    order.push('next')
  })
  await held.promise
  resume.resolve()
  await Promise.resolve()
  expect(order).toEqual(['nested'])
  release.resolve()
  await Promise.all([next, descendant])
  expect(order).toEqual(['nested', 'next', 'descendant'])
})

it('detaches reactor work so it cannot borrow its acceptance lane', async () => {
  const order: string[] = []
  let detached = Promise.resolve()
  await withGitRepositoryLane('/repo', async () => {
    detached = outsideGitRepositoryLane(() =>
      withGitRepositoryLane('/repo', async () => {
        order.push('reactor')
      }),
    )
    await withGitRepositoryLane('/other', async () => {
      order.push('independent')
    })
    order.push('acceptance')
  })
  await detached
  expect(order).toEqual(['independent', 'acceptance', 'reactor'])
})

it('releases streamed lanes even when iterator cleanup throws', async () => {
  const stream = withGitRepositoryLaneStream('/repo', async function* () {
    try {
      yield 1
    } finally {
      // oxlint-disable-next-line no-unsafe-finally -- Exercise iterator cleanup failure.
      throw new Error('cleanup failed')
    }
  })
  expect(await stream.next()).toMatchObject({ value: 1 })
  await expect(stream.return(undefined)).rejects.toThrow('cleanup failed')
  expect(await withGitRepositoryLane('/repo', async () => 'released')).toBe('released')
})
