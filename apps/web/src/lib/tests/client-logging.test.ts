import { DEFAULT_PROVIDER_DRIVER_KIND, providerInstanceIdSchema } from '@workspace/contracts'
import * as v from 'valibot'
import { afterEach, beforeEach, vi } from 'vitest'

import { expect, test } from '../../../test/fixtures'
import type { ActiveSettingsIntent } from '@/features/settings/state/intent-store'
import { settingsMutationLogContext } from '@/features/settings/utils/mutation-observability'
import { log, observeClientOperation } from '@/lib/client-logging'

const { emittedEvents } = vi.hoisted(() => ({
  emittedEvents: [] as EmittedClientEvent[],
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

type EmittedClientEvent = {
  readonly event: Record<string, unknown>
  readonly level: string
}

beforeEach(() => {
  emittedEvents.length = 0
  vi.stubEnv('OBSERVABILITY_ENABLED', 'true')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test('assigns stable event ids and retains structured failure fields', async () => {
  log.info({ action: 'settings.read', area: 'settings', eventId: 'event-explicit' })
  log.info({ action: 'settings.read', area: 'settings' })

  const failure = Object.assign(new Error('Settings write was rejected.'), {
    code: 'settings.WRITE_CONTENDED',
    status: 409,
  })
  await expect(
    observeClientOperation(
      {
        action: 'settings.write',
        area: 'settings',
        mutationId: 'mutation-failed',
        target: 'user',
      },
      async () => Promise.reject(failure),
    ),
  ).rejects.toBe(failure)

  expect(emittedEvents).toHaveLength(3)
  expect(emittedEvents[0]?.event.eventId).toBe('event-explicit')
  expect(emittedEvents[1]?.event.eventId).toEqual(expect.any(String))
  expect(emittedEvents[1]?.event.eventId).not.toBe('event-explicit')
  expect(emittedEvents[2]?.event.eventId).not.toBe(emittedEvents[1]?.event.eventId)
  expect(emittedEvents[2]).toMatchObject({
    event: {
      action: 'settings.write',
      area: 'settings',
      error: {
        code: 'settings.WRITE_CONTENDED',
        message: 'Settings write was rejected.',
        name: 'Error',
        status: 409,
      },
      eventId: expect.any(String),
      mutationId: 'mutation-failed',
      outcome: 'error',
      runtime: 'browser',
      target: 'user',
    },
    level: 'warn',
  })
})

test('emits mutation metadata without values and redacts raw or path diagnostics', () => {
  const context = settingsMutationLogContext(settingsIntentWithPrivateValues())
  log.warn({
    absolutePath: '/Users/example/.platform/settings.json',
    action: 'settings.write',
    area: 'settings',
    eventId: 'event-sanitized',
    secret: 'provider-secret-value',
    text: '{"workbench.colorTheme":"light"}',
    ...context,
  })

  expect(emittedEvents).toEqual([
    {
      event: {
        absolutePath: '[redacted]',
        action: 'settings.write',
        affectedIds: ['codex-private'],
        area: 'settings',
        clientSequence: 7,
        eventId: 'event-sanitized',
        initiator: 'settings.ui',
        mutationId: 'mutation-private',
        operationKinds: ['set', 'provider.setEnabled'],
        runtime: 'browser',
        secret: '[redacted]',
        settingIds: ['workbench.colorTheme', 'providers.instances'],
        target: 'user',
        text: '[redacted]',
      },
      level: 'warn',
    },
  ])

  const serialized = JSON.stringify(emittedEvents[0])
  expect(serialized).not.toContain('/Users/example')
  expect(serialized).not.toContain('provider-secret-value')
  expect(serialized).not.toContain('PRIVATE_PROVIDER_TOKEN')
  expect(serialized).not.toContain('private-config-value')
  expect(serialized).not.toContain('"workbench.colorTheme":"light"')
})

function emit(level: string, event: Record<string, unknown>) {
  emittedEvents.push({ event, level })
}

function settingsIntentWithPrivateValues(): ActiveSettingsIntent {
  return {
    clientSequence: 7,
    enqueuedAt: 1,
    initiator: 'settings.ui',
    request: {
      mutationId: 'mutation-private',
      operations: [
        { key: 'workbench.colorTheme', kind: 'set', value: 'light' },
        {
          createIfMissing: {
            config: { privateConfig: 'private-config-value' },
            driverKind: DEFAULT_PROVIDER_DRIVER_KIND,
            environment: [{ name: 'PRIVATE_PROVIDER_TOKEN', value: '' }],
          },
          enabled: true,
          kind: 'provider.setEnabled',
          providerInstanceId: v.parse(providerInstanceIdSchema, 'codex-private'),
        },
      ],
      target: 'user',
    },
    resources: [],
    settled: Promise.resolve('failed'),
    status: 'pending',
    transportSettled: false,
  }
}
