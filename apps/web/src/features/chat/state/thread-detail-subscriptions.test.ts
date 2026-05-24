import { beforeEach, describe, expect, it } from 'bun:test'
import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  projectIdSchema,
  threadIdSchema,
  type ClientOrchestrationCommand,
  type OrchestrationReplayEventsInput,
  type OrchestrationReplayEventsResult,
  type OrchestrationShellSnapshot,
  type OrchestrationShellStreamItem,
  type OrchestrationThreadShell,
  type OrchestrationThreadStreamItem,
  type ThreadId,
  turnIdSchema,
} from '@workspace/contracts'
import * as v from 'valibot'

import type { ChatEnvironment } from '../environment/chat-environment'
import { useChatProjectionStore } from './chat-projection-store'
import { createThreadDetailSubscriptionCache } from './thread-detail-subscriptions'

describe('thread detail subscription cache', () => {
  beforeEach(() => {
    useChatProjectionStore.getState().resetChatProjection()
  })

  it('retains one active stream per thread and evicts after final release', async () => {
    const fake = createFakeEnvironment()
    const timers = createManualTimers()
    const cache = createThreadDetailSubscriptionCache({
      environment: fake.environment,
      scheduleTimeout: timers.schedule,
      clearScheduledTimeout: timers.clear,
    })
    const threadId = parseThreadId('thread-1')

    const releaseFirst = cache.retain(threadId)
    const releaseSecond = cache.retain(threadId)

    expect(fake.starts.map((start) => start.threadId)).toEqual([threadId])
    expect(cache.snapshot()[0]?.refCount).toBe(2)

    releaseFirst()
    expect(cache.snapshot()[0]?.refCount).toBe(1)
    expect(timers.size()).toBe(0)

    releaseSecond()
    expect(cache.snapshot()[0]?.refCount).toBe(0)
    expect(timers.size()).toBe(1)

    timers.runAll()
    await waitForMicrotasks()

    expect(cache.size()).toBe(0)
    expect(fake.aborts).toEqual([threadId])
  })

  it('protects running and actionable threads from idle eviction', () => {
    const fake = createFakeEnvironment()
    const timers = createManualTimers()
    const cache = createThreadDetailSubscriptionCache({
      environment: fake.environment,
      scheduleTimeout: timers.schedule,
      clearScheduledTimeout: timers.clear,
    })
    const threadId = parseThreadId('thread-1')

    useChatProjectionStore
      .getState()
      .syncShellSnapshot(makeShellSnapshot([makeThreadShell({ id: threadId, status: 'running' })]))

    const release = cache.retain(threadId)
    release()

    expect(cache.size()).toBe(1)
    expect(cache.snapshot()[0]?.hasEvictionTimer).toBe(false)
    expect(timers.size()).toBe(0)

    cache.disposeAll()
  })

  it('evicts the oldest idle entries when the cache exceeds capacity', async () => {
    const fake = createFakeEnvironment()
    const cache = createThreadDetailSubscriptionCache({
      environment: fake.environment,
      maxCachedSubscriptions: 2,
      now: incrementingClock(),
    })
    const firstThreadId = parseThreadId('thread-1')
    const secondThreadId = parseThreadId('thread-2')
    const thirdThreadId = parseThreadId('thread-3')

    cache.retain(firstThreadId)()
    cache.retain(secondThreadId)()
    cache.retain(thirdThreadId)()

    await waitForMicrotasks()

    expect(cache.size()).toBe(2)
    expect(cache.snapshot().map((entry) => entry.threadId)).toEqual([secondThreadId, thirdThreadId])
    expect(fake.aborts).toEqual([firstThreadId])

    cache.disposeAll()
  })

  it('prewarms only the first visible sidebar threads', () => {
    const fake = createFakeEnvironment()
    const cache = createThreadDetailSubscriptionCache({
      environment: fake.environment,
    })
    const threadIds = Array.from({ length: 12 }, (_, index) => parseThreadId(`thread-${index}`))

    cache.prewarmSidebarThreadDetails(threadIds)

    expect(fake.starts.map((start) => start.threadId)).toEqual(threadIds.slice(0, 10))
    expect(cache.snapshot().every((entry) => entry.refCount === 0)).toBe(true)

    cache.disposeAll()
  })
})

function createFakeEnvironment() {
  const starts: Array<{ afterSequence: number | undefined; threadId: ThreadId }> = []
  const aborts: ThreadId[] = []

  const environment: ChatEnvironment = {
    dispatchCommand: async (_command: ClientOrchestrationCommand) => ({
      deduped: false,
      sequence: 0,
    }),
    replayEvents: async (
      _input: OrchestrationReplayEventsInput,
    ): Promise<OrchestrationReplayEventsResult> => ({ events: [] }),
    shellStream: async function* (): AsyncGenerator<OrchestrationShellStreamItem> {
      const item = await new Promise<OrchestrationShellStreamItem>(() => undefined)

      yield item
    },
    threadDetailStream: async function* (threadId, input = {}) {
      starts.push({ afterSequence: input.afterSequence, threadId })

      await new Promise<void>((resolve) => {
        input.signal?.addEventListener('abort', resolve, { once: true })
      })

      aborts.push(threadId)
      if (!input.signal?.aborted) {
        const item = await new Promise<OrchestrationThreadStreamItem>(() => undefined)

        yield item
      }
    },
  }

  return { aborts, environment, starts }
}

function createManualTimers() {
  let nextId = 1
  const timers = new Map<number, () => void>()

  return {
    clear: (handle: ReturnType<typeof setTimeout>) => {
      timers.delete(handle as unknown as number)
    },
    runAll: () => {
      const callbacks = [...timers.values()]
      timers.clear()

      for (const callback of callbacks) {
        callback()
      }
    },
    schedule: (callback: () => void) => {
      const handle = nextId
      nextId += 1
      timers.set(handle, callback)

      return handle as unknown as ReturnType<typeof setTimeout>
    },
    size: () => timers.size,
  }
}

function makeShellSnapshot(threads: OrchestrationThreadShell[]): OrchestrationShellSnapshot {
  return {
    projects: [
      {
        createdAt: timestamp(0),
        defaultModelSelection: null,
        id: parseProjectId('project-1'),
        title: 'Project',
        updatedAt: timestamp(0),
        workspaceRoot: '/workspace',
      },
    ],
    snapshotSequence: 1,
    threads,
    updatedAt: timestamp(1),
  }
}

function makeThreadShell(
  overrides: Partial<OrchestrationThreadShell> & { status?: 'idle' | 'running' } = {},
): OrchestrationThreadShell {
  const status = overrides.status ?? 'idle'

  return {
    archivedAt: null,
    branch: null,
    createdAt: timestamp(0),
    hasActionableProposedPlan: false,
    id: parseThreadId('thread-1'),
    interactionMode: DEFAULT_INTERACTION_MODE,
    latestTurn:
      status === 'running'
        ? {
            assistantMessageId: null,
            completedAt: null,
            requestedAt: timestamp(0),
            startedAt: timestamp(0),
            state: 'running',
            turnId: parseTurnId('turn-1'),
          }
        : null,
    latestUserMessageAt: null,
    modelSelection: {
      model: 'codex-test',
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
    },
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    projectId: parseProjectId('project-1'),
    runtimeMode: DEFAULT_RUNTIME_MODE,
    session:
      status === 'running'
        ? {
            activeTurnId: parseTurnId('turn-1'),
            lastError: null,
            providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
            providerName: 'codex',
            providerSessionId: 'session-1',
            runtimeMode: DEFAULT_RUNTIME_MODE,
            status: 'running',
            threadId: overrides.id ?? parseThreadId('thread-1'),
            updatedAt: timestamp(0),
          }
        : null,
    title: 'Thread',
    updatedAt: timestamp(0),
    worktreePath: null,
    ...withoutStatus(overrides),
  }
}

function withoutStatus<T extends { status?: unknown }>(value: T) {
  const { status: _status, ...rest } = value

  return rest
}

function incrementingClock() {
  let value = 0

  return () => {
    value += 1
    return value
  }
}

async function waitForMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

function parseProjectId(value: string) {
  return v.parse(projectIdSchema, value)
}

function parseThreadId(value: string) {
  return v.parse(threadIdSchema, value)
}

function parseTurnId(value: string) {
  return v.parse(turnIdSchema, value)
}

function timestamp(index: number) {
  return `2026-05-24T00:00:${String(index).padStart(2, '0')}.000Z`
}
