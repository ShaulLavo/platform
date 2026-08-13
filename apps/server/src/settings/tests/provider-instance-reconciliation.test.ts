import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { REDACTED_SETTINGS_VALUE } from '@workspace/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROVIDER_INSTANCES } from '../../provider/drivers/built-in'
import { mergeProviderInstanceConfigs } from '../../provider/utils/instance-config-merge'
import { MockProviderAdapter } from '../../provider/adapters/mock'
import { ProviderAdapterRegistry } from '../../provider/provider-adapter-registry'
import { SettingsStore } from '../store'

const stores: SettingsStore[] = []
const roots: string[] = []

async function createSettings() {
  const root = await mkdtemp(path.join(tmpdir(), 'settings-store-'))
  roots.push(root)
  const store = new SettingsStore({
    userFilePath: path.join(root, 'settings.json'),
    watch: false,
  })
  stores.push(store)

  return store
}

function instanceWithToken(value: string) {
  return {
    driverKind: 'codex',
    environment: [{ name: 'CODEX_TOKEN', value }],
    providerInstanceId: 'codex-work',
  }
}

const writeInstances = (store: SettingsStore, instances: unknown) =>
  store.write({ edits: [{ key: 'providers.instances', value: instances, target: 'user' }] })

afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('provider instances from settings', () => {
  it('tells a subscriber about every write, so a saved list is not inert', async () => {
    const settings = await createSettings()
    const seen: number[] = []
    settings.onChange((next) => seen.push(next.values['providers.instances'].length))

    await writeInstances(settings, [{ driverKind: 'codex', providerInstanceId: 'codex-work' }])

    // Without this the settings UI writes a document the server reads only on
    // the next restart, which is what made every configurable field inert.
    expect(seen).toEqual([1])
    expect(settings.snapshot().values['providers.instances'][0]?.providerInstanceId).toBe(
      'codex-work',
    )
  })

  it('keeps a write durable when a subscriber throws', async () => {
    const settings = await createSettings()
    settings.onChange(() => {
      throw new Error('reconcile blew up')
    })

    // The file is already written by the time listeners run. Reporting "save
    // failed" would have the user retry a write that already happened.
    await expect(
      writeInstances(settings, [{ driverKind: 'codex', providerInstanceId: 'codex-work' }]),
    ).resolves.toBeDefined()
    expect(settings.snapshot().values['providers.instances']).toHaveLength(1)
  })
})

describe('provider secrets stay out of the document', () => {
  it('never sends a stored environment value to a client', async () => {
    const settings = await createSettings()
    await writeInstances(settings, [instanceWithToken('sk-live-abc123')])

    const snapshot = settings.snapshot()

    expect(JSON.stringify(snapshot)).not.toContain('sk-live-abc123')
    expect(snapshot.values['providers.instances'][0]?.environment[0]?.value).toBe(
      REDACTED_SETTINGS_VALUE,
    )
    // The server can still launch the provider, because the spawn path resolves
    // the value from the secret store rather than from the document.
    const forSpawn = await settings.providerInstancesForSpawn()
    expect(forSpawn[0]?.environment[0]?.value).toBe('sk-live-abc123')
  })

  it('keeps the value out of the settings file itself, not just off the wire', async () => {
    const settings = await createSettings()
    await writeInstances(settings, [instanceWithToken('sk-live-abc123')])

    // The raw text is what `GET /settings/raw`, the JSON editor tab and export
    // all serve. Redaction protects the wire; this is what protects the disk.
    expect(settings.rawLayer('user').text).not.toContain('sk-live-abc123')
  })

  it('keeps the secret when the masked document is saved back unchanged', async () => {
    const settings = await createSettings()
    await writeInstances(settings, [instanceWithToken('sk-live-abc123')])

    // Exactly what an editor does: read, change something unrelated, save. The
    // value it holds for the token is the mask, and writing that through would
    // destroy the secret on the first save after every read.
    await writeInstances(settings, settings.snapshot().values['providers.instances'])

    const forSpawn = await settings.providerInstancesForSpawn()
    expect(forSpawn[0]?.environment[0]?.value).toBe('sk-live-abc123')
  })

  it('distinguishes a variable that is set from one that is empty', async () => {
    const settings = await createSettings()
    await writeInstances(settings, [
      {
        driverKind: 'codex',
        environment: [
          { name: 'CODEX_TOKEN', value: 'secret' },
          { name: 'CODEX_UNSET', value: '' },
        ],
        providerInstanceId: 'codex-work',
      },
    ])

    const environment = settings.snapshot().values['providers.instances'][0]?.environment ?? []

    // "not set" and "set to something I am not showing you" are different facts;
    // masking both would make the editor lie about which.
    expect(environment[0]?.value).toBe(REDACTED_SETTINGS_VALUE)
    expect(environment[1]?.value).toBe('')
  })

  it('clears the secret when the value is emptied', async () => {
    const settings = await createSettings()
    await writeInstances(settings, [instanceWithToken('sk-live-abc123')])
    await writeInstances(settings, [instanceWithToken('')])

    expect(settings.snapshot().values['providers.instances'][0]?.environment[0]?.value).toBe('')
    const forSpawn = await settings.providerInstancesForSpawn()
    expect(forSpawn[0]?.environment[0]?.value).toBe('')
  })
})

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

describe('reconcile against a live session', () => {
  it('keeps an adapter that is still serving a session', async () => {
    const live = new Set<string>()
    const registry = new ProviderAdapterRegistry({
      adapters: [new MockProviderAdapter()],
      hasLiveSessions: (id) => live.has(id),
    })
    const [instanceId] = registry.listInstances()
    expect(instanceId).toBeDefined()
    live.add(instanceId!)

    // Removing it from settings while a turn is streaming. Disposing here would
    // kill the child process the session is reading from, and the turn would die
    // with whatever the transport threw.
    await registry.reconcile([])

    expect(registry.listInstances()).toContain(instanceId)
  })

  it('disposes it on a later reconcile once the session ends', async () => {
    const live = new Set<string>()
    const registry = new ProviderAdapterRegistry({
      adapters: [new MockProviderAdapter()],
      hasLiveSessions: (id) => live.has(id),
    })
    const [instanceId] = registry.listInstances()
    live.add(instanceId!)
    await registry.reconcile([])

    live.delete(instanceId!)
    await registry.reconcile([])

    // Deferred, not cancelled: the removal still happens, just after the turn.
    expect(registry.listInstances()).not.toContain(instanceId)
  })

  it('disposes immediately when nothing is using it', async () => {
    const registry = new ProviderAdapterRegistry({ adapters: [new MockProviderAdapter()] })
    expect(registry.listInstances()).toHaveLength(1)

    await registry.reconcile([])

    expect(registry.listInstances()).toHaveLength(0)
  })
})
