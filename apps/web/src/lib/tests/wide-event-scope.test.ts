import { beforeEach, describe, expect, test, vi } from 'vitest'

const emittedEvents: Record<string, unknown>[] = []
const contexts: Record<string, unknown>[] = []

vi.mock('evlog', () => ({
  createRequestLogger: () => {
    const context: Record<string, unknown> = {}
    contexts.push(context)

    return {
      set(next: Record<string, unknown>) {
        mergeContext(context, next)
      },
      getContext() {
        return context
      },
      warn(message: string, next?: Record<string, unknown>) {
        mergeContext(context, { warning: { message, ...next } })
      },
      error(error: Error | string, next?: Record<string, unknown>) {
        const message = error instanceof Error ? error.message : error
        mergeContext(context, { error: { message, ...next } })
      },
      emit(next?: Record<string, unknown>) {
        if (next) mergeContext(context, next)
        emittedEvents.push({ ...context })
      },
    }
  },
}))

vi.mock('@/lib/client-logging', () => ({
  clientLoggingEnabled: () => true,
  sanitizeRecord: (record: Record<string, unknown>) => record,
}))

describe('createWideEventScope', () => {
  beforeEach(() => {
    emittedEvents.length = 0
    contexts.length = 0
  })

  test('accumulates context and emits once', async () => {
    const { createWideEventScope } = await import('@/lib/wide-event-scope')
    const scope = createWideEventScope({ action: 'workspace.events.summary', area: 'workspace' })

    scope.set({ workspace: { path: '/repo' } })
    scope.increment('events.batchCount')
    scope.increment('events.eventCount', 3)
    scope.increment('events.eventCount', 2)
    scope.end({ outcome: 'ok' })
    scope.end({ outcome: 'duplicate' })

    expect(scope.count('events.eventCount')).toBe(5)
    expect(emittedEvents).toEqual([
      {
        action: 'workspace.events.summary',
        area: 'workspace',
        events: {
          batchCount: 1,
          eventCount: 5,
        },
        outcome: 'ok',
        runtime: 'browser',
        workspace: { path: '/repo' },
      },
    ])
  })

  test('folds warnings and errors into the current event', async () => {
    const { createWideEventScope } = await import('@/lib/wide-event-scope')
    const scope = createWideEventScope({ action: 'chat.stream.summary', area: 'chat' })

    scope.warn('slow stream', { code: 'SLOW' })
    scope.error(new Error('closed'), { code: 'CLOSED' })

    expect(scope.getContext()).toMatchObject({
      error: { code: 'CLOSED', message: 'closed' },
      warning: { code: 'SLOW', message: 'slow stream' },
    })
  })
})

function mergeContext(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (isRecord(target[key]) && isRecord(value)) {
      mergeContext(target[key], value)
      continue
    }

    target[key] = value
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
