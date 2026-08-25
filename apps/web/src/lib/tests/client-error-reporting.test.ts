import { afterEach, beforeEach, vi } from 'vitest'

import { expect, test } from '../../../test/fixtures'
import { reportClientError } from '@/lib/client-error-reporting'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { observeClientOperation } from '@/lib/client-logging'
import { notifySaveError } from '@/features/settings/utils/notify-save-error'

const { emittedEvents, toastError } = vi.hoisted(() => ({
  emittedEvents: [] as EmittedClientEvent[],
  toastError: vi.fn(),
}))

vi.mock('evlog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('evlog')>()

  return {
    ...actual,
    initLogger: vi.fn(),
    log: {
      debug: (event: Record<string, unknown>) => emit('debug', event),
      error: (event: Record<string, unknown>) => emit('error', event),
      info: (event: Record<string, unknown>) => emit('info', event),
      warn: (event: Record<string, unknown>) => emit('warn', event),
    },
  }
})

vi.mock('sonner', () => ({
  toast: {
    dismiss: vi.fn(),
    error: toastError,
  },
}))

type EmittedClientEvent = {
  readonly event: Record<string, unknown>
  readonly level: string
}

beforeEach(() => {
  emittedEvents.length = 0
  toastError.mockClear()
  vi.stubEnv('OBSERVABILITY_ENABLED', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test('reports structured code and status without secret or absolute-path values', () => {
  const failure = Object.assign(new Error('Settings write was rejected.'), {
    code: 'settings.WRITE_CONTENDED',
    fix: 'Retry after another writer finishes.',
    status: 409,
    why: 'The write could not acquire the settings lease.',
  })

  reportClientError({
    area: 'settings',
    category: 'io_error',
    cause: failure,
    context: {
      absolutePath: '/Users/example/.platform/settings.json',
      authorization: 'Bearer provider-secret',
      mutationId: 'mutation-rejected',
      token: 'provider-token',
    },
    message: 'Settings write was rejected.',
    operation: 'settings.write',
  })

  expect(emittedEvents).toMatchObject([
    {
      event: {
        action: 'client.error',
        area: 'settings',
        cause: {
          code: 'settings.WRITE_CONTENDED',
          fix: 'Retry after another writer finishes.',
          message: 'Settings write was rejected.',
          name: 'Error',
          status: 409,
          why: 'The write could not acquire the settings lease.',
        },
        context: {
          absolutePath: '[redacted]',
          authorization: '[redacted]',
          mutationId: 'mutation-rejected',
          token: '[redacted]',
        },
        eventId: expect.any(String),
        operation: 'settings.write',
        runtime: 'browser',
      },
      level: 'error',
    },
  ])

  const serialized = JSON.stringify(emittedEvents[0])
  expect(serialized).not.toContain('/Users/example')
  expect(serialized).not.toContain('provider-secret')
  expect(serialized).not.toContain('provider-token')
})

test('keeps one canonical settings failure without a parallel client error', async () => {
  const failure = Object.assign(new Error('Settings write was rejected.'), {
    code: 'settings.WRITE_CONTENDED',
    status: 409,
  })

  await expect(
    observeClientOperation(
      {
        action: 'settings.write',
        area: 'settings',
        mutationId: 'mutation-canonical',
        operationKinds: ['set'],
        settingIds: ['workbench.colorTheme'],
        target: 'user',
      },
      async () => Promise.reject(failure),
    ),
  ).rejects.toBe(failure)

  notifySaveError({
    discard: vi.fn(),
    error: failure,
    mutationId: 'mutation-canonical',
    retry: vi.fn(),
  })

  expect(emittedEvents).toHaveLength(1)
  expect(emittedEvents[0]).toMatchObject({
    event: {
      action: 'settings.write',
      area: 'settings',
      error: { code: 'settings.WRITE_CONTENDED', status: 409 },
      mutationId: 'mutation-canonical',
      operationKinds: ['set'],
      settingIds: ['workbench.colorTheme'],
      target: 'user',
    },
    level: 'warn',
  })
  expect(emittedEvents.some(({ event }) => event.action === 'client.error')).toBe(false)
  expect(toastError).toHaveBeenCalledOnce()
})

test('keeps one canonical raw-save failure when command reporting shows its toast', async () => {
  const failure = Object.assign(new Error('Settings kept changing before save.'), {
    code: 'settings.WRITE_CONTENDED',
    status: 503,
  })

  await expect(
    observeClientOperation(
      {
        action: 'settings.write-raw',
        area: 'settings',
        target: 'user',
        writeId: 'raw-save-contended',
      },
      async () => Promise.reject(failure),
    ),
  ).rejects.toBe(failure)

  reportError(toClientError(failure))

  expect(emittedEvents).toHaveLength(1)
  expect(emittedEvents[0]).toMatchObject({
    event: {
      action: 'settings.write-raw',
      area: 'settings',
      error: { code: 'settings.WRITE_CONTENDED', status: 503 },
      target: 'user',
      writeId: 'raw-save-contended',
    },
    level: 'warn',
  })
  expect(emittedEvents.some(({ event }) => event.action === 'client.error')).toBe(false)
  expect(toastError).toHaveBeenCalledOnce()
})

function emit(level: string, event: Record<string, unknown>) {
  emittedEvents.push({ event, level })
}
