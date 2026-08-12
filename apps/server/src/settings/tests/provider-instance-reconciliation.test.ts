import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import { REDACTED_SETTINGS_VALUE } from '@workspace/contracts'

import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { DEFAULT_PROVIDER_INSTANCES } from '../../provider/drivers/built-in'
import { mergeProviderInstanceConfigs } from '../../provider/utils/instance-config-merge'
import { SettingsService } from '../service'

const closers: Array<() => void> = []

afterEach(() => {
  for (const close of closers.splice(0)) close()
})

describe('provider instances from settings', () => {
  it('tells a subscriber about every write, so a saved list is not inert', () => {
    const settings = createSettings()
    const seen: number[] = []
    settings.onChange((next) => seen.push(next.providerInstances.length))

    settings.update({
      providerInstances: [
        {
          driverKind: 'codex',
          providerInstanceId: 'codex-work',
        },
      ],
    })

    // Without this the settings UI writes rows the server reads only on the
    // next restart, which is what made every configurable instance field inert.
    expect(seen).toEqual([1])
    expect(settings.read().providerInstances[0]?.providerInstanceId).toBe('codex-work')
  })

  it('keeps a write durable when a subscriber throws', () => {
    const settings = createSettings()
    settings.onChange(() => {
      throw new Error('reconcile blew up')
    })

    // The settings are already committed by the time listeners run. Reporting
    // "save failed" would have the user retry a write that already happened.
    expect(() =>
      settings.update({
        providerInstances: [{ driverKind: 'codex', providerInstanceId: 'codex-work' }],
      }),
    ).not.toThrow()
    expect(settings.read().providerInstances).toHaveLength(1)
  })
})

describe('provider secrets on the wire', () => {
  it('never sends a stored environment value to a client', () => {
    const settings = createSettings()
    settings.update({ providerInstances: [instanceWithToken('sk-live-abc123')] })

    const forClient = settings.readForClient()

    // The settings document is served over HTTP and this is where an API token
    // ends up. Behind an origin check is not protection, and the value would
    // land in any log or crash report that captures a response body.
    expect(JSON.stringify(forClient)).not.toContain('sk-live-abc123')
    expect(forClient.providerInstances[0]?.environment[0]?.value).toBe(REDACTED_SETTINGS_VALUE)
    // The server still holds the real one, or the provider cannot launch.
    expect(settings.read().providerInstances[0]?.environment[0]?.value).toBe('sk-live-abc123')
  })

  it('keeps the secret when the masked document is saved back unchanged', () => {
    const settings = createSettings()
    settings.update({ providerInstances: [instanceWithToken('sk-live-abc123')] })

    // Exactly what an editor does: read, change something unrelated, save. The
    // value it holds for the token is the mask, and writing that through would
    // destroy the secret on the first save after every read.
    settings.update({ providerInstances: settings.readForClient().providerInstances })

    expect(settings.read().providerInstances[0]?.environment[0]?.value).toBe('sk-live-abc123')
  })

  it('distinguishes a variable that is set from one that is empty', () => {
    const settings = createSettings()
    settings.update({
      providerInstances: [
        {
          driverKind: 'codex',
          environment: [
            { name: 'CODEX_TOKEN', value: 'secret' },
            { name: 'CODEX_UNSET', value: '' },
          ],
          providerInstanceId: 'codex-work',
        },
      ],
    })

    const environment = settings.readForClient().providerInstances[0]?.environment ?? []

    // "not set" and "set to something I am not showing you" are different
    // facts; masking both would make the editor lie about which.
    expect(environment[0]?.value).toBe(REDACTED_SETTINGS_VALUE)
    expect(environment[1]?.value).toBe('')
  })
})

function instanceWithToken(value: string) {
  return {
    driverKind: 'codex',
    environment: [{ name: 'CODEX_TOKEN', value }],
    providerInstanceId: 'codex-work',
  }
}

describe('merging saved instances over the built-ins', () => {
  it('never reconciles the registry down to nothing', () => {
    // Every install starts with an empty settings document, and a bad write
    // leaves one behind. Replacing rather than layering would leave the app
    // with no provider at all and no way to reach a model.
    expect(mergeProviderInstanceConfigs(DEFAULT_PROVIDER_INSTANCES, [])).toEqual(
      DEFAULT_PROVIDER_INSTANCES,
    )
  })

  it('lets a saved entry override a built-in and adds the rest', () => {
    const first = DEFAULT_PROVIDER_INSTANCES[0]
    expect(first).toBeDefined()
    const disabled = { ...first!, enabled: false }
    const extra = { ...first!, providerInstanceId: parseInstanceId('codex-second') }

    const merged = mergeProviderInstanceConfigs(DEFAULT_PROVIDER_INSTANCES, [disabled, extra])

    // Overrides land in place — the picker's order is the defaults' order —
    // and genuinely new instances follow.
    expect(merged[0]).toEqual(disabled)
    expect(merged).toHaveLength(DEFAULT_PROVIDER_INSTANCES.length + 1)
    expect(merged.at(-1)?.providerInstanceId).toBe('codex-second')
  })
})

function parseInstanceId(value: string) {
  return value as (typeof DEFAULT_PROVIDER_INSTANCES)[number]['providerInstanceId']
}

function createSettings() {
  const sqlite = new Database(':memory:', { create: true })
  closers.push(() => sqlite.close())
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)

  return new SettingsService(database)
}
