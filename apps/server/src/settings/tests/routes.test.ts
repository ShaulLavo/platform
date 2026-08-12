import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '@workspace/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { closeApp, createApp } from '../../app'
import { createMetadataDatabase, type MetadataDatabaseHandle } from '../../db/client'
import { settingsErrors } from '../structured-errors'
import { redactSettings } from '../utils/redaction'

const TRUSTED_ORIGIN = 'http://localhost:5173'

type Harness = {
  app: ReturnType<typeof createApp>
  database: MetadataDatabaseHandle
  root: string
}

const harnesses: Harness[] = []

afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    await closeApp(harness.app)
    harness.database.close()
    await rm(harness.root, { force: true, recursive: true })
  }
})

describe('settings routes', () => {
  it('serves contract defaults before anything is written', async () => {
    const harness = await makeHarness()

    expect(await readSettings(harness)).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips a full document through the real server', async () => {
    const harness = await makeHarness()
    const patch = {
      keybindings: { 'workspace.saveFile': 'mod+s', 'workspace.togglePanel': null },
      models: {
        hidden: [{ providerInstanceId: 'codex', model: 'gpt-5-codex-mini' }],
        order: [{ providerInstanceId: 'claude', model: 'claude-opus-4-6' }],
      },
      providerInstances: [
        {
          providerInstanceId: 'codex-work',
          driverKind: 'codex',
          displayLabel: 'Codex (work)',
          enabled: false,
          binaryPath: '/opt/bin/codex',
          launchArgs: ['--profile', 'work'],
          environment: [{ name: 'CODEX_HOME', value: '/opt/codex' }],
          config: { sandbox: 'workspace-write' },
        },
      ],
    }

    const written = await writeSettings(harness, patch)

    // Everything round-trips except the environment values, which come back
    // masked: this document is served over HTTP and it is where an API token
    // ends up. The mask is what a client is allowed to see, and sending it back
    // unchanged means "keep what is stored".
    const expected = redactSettings({ ...DEFAULT_SETTINGS, ...patch } as unknown as Settings)
    expect(written).toEqual(expected)
    expect(await readSettings(harness)).toEqual(expected)
    expect(JSON.stringify(written)).not.toContain('/opt/codex')
  })

  it('survives a restart against the same database', async () => {
    const harness = await makeHarness()
    await writeSettings(harness, { keybindings: { 'workspace.saveFile': 'mod+alt+s' } })

    const reopened = await makeHarness({ database: harness.database })

    expect((await readSettings(reopened)).keybindings).toEqual({
      'workspace.saveFile': 'mod+alt+s',
    })
  })

  it('replaces only the sections a patch names', async () => {
    const harness = await makeHarness()
    await writeSettings(harness, {
      providerInstances: [{ providerInstanceId: 'codex', driverKind: 'codex' }],
    })

    const updated = await writeSettings(harness, {
      keybindings: { 'workspace.togglePanel': 'mod+j' },
    })

    expect(updated.providerInstances).toHaveLength(1)
    expect(updated.keybindings).toEqual({ 'workspace.togglePanel': 'mod+j' })
  })

  it('fills per-instance defaults for a minimal provider entry', async () => {
    const harness = await makeHarness()

    const updated = await writeSettings(harness, {
      providerInstances: [{ providerInstanceId: 'codex', driverKind: 'codex' }],
    })

    expect(updated.providerInstances[0]).toEqual({
      binaryPath: '',
      config: {},
      displayLabel: null,
      driverKind: 'codex',
      enabled: true,
      environment: [],
      launchArgs: [],
      providerInstanceId: 'codex',
    })
  })

  it('rejects an unknown section with a typed error', async () => {
    const harness = await makeHarness()
    const response = await post(harness, { nope: true })

    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe(settingsErrors.PATCH_INVALID.code)
    expect(await readSettings(harness)).toEqual(DEFAULT_SETTINGS)
  })

  it('rejects duplicate provider instance ids', async () => {
    const harness = await makeHarness()
    const response = await post(harness, {
      providerInstances: [
        { providerInstanceId: 'codex', driverKind: 'codex' },
        { providerInstanceId: 'codex', driverKind: 'claude' },
      ],
    })

    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe(settingsErrors.PATCH_INVALID.code)
    expect(await readSettings(harness)).toEqual(DEFAULT_SETTINGS)
  })

  it('rejects a provider instance id that is not a slug', async () => {
    const harness = await makeHarness()
    const response = await post(harness, {
      providerInstances: [{ providerInstanceId: '9 lives', driverKind: 'codex' }],
    })

    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe(settingsErrors.PATCH_INVALID.code)
  })

  it('rejects a keybinding override for a malformed command id', async () => {
    const harness = await makeHarness()
    const response = await post(harness, { keybindings: { 'not a command': 'mod+s' } })

    expect(response.status).toBe(400)
    expect(await errorCode(response)).toBe(settingsErrors.PATCH_INVALID.code)
  })
})

async function makeHarness(options: { database?: MetadataDatabaseHandle } = {}): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'settings-itest-'))
  const database = options.database ?? createMetadataDatabase({ databasePath: ':memory:' })
  const app = createApp({
    auth: { allowedOrigins: [TRUSTED_ORIGIN] },
    metadataDatabase: database,
    orchestration: { database: database.db },
    watch: false,
    workspaceRoot: root,
  })
  // A reused database belongs to the harness that opened it; closing it twice
  // would fail the teardown of whichever harness ran second.
  const harness = { app, database: options.database ? untracked(database) : database, root }
  harnesses.push(harness)

  return harness
}

function untracked(database: MetadataDatabaseHandle): MetadataDatabaseHandle {
  return { ...database, close: () => {} }
}

async function readSettings(harness: Harness): Promise<Settings> {
  const response = await harness.app.handle(
    new Request('http://local/settings', { headers: { origin: TRUSTED_ORIGIN } }),
  )
  expect(response.status).toBe(200)

  return (await response.json()) as Settings
}

async function writeSettings(harness: Harness, patch: unknown): Promise<Settings> {
  const response = await post(harness, patch)
  expect(response.status).toBe(200)

  return (await response.json()) as Settings
}

function post(harness: Harness, body: unknown) {
  return harness.app.handle(
    new Request('http://local/settings', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', origin: TRUSTED_ORIGIN },
      method: 'POST',
    }),
  )
}

async function errorCode(response: Response) {
  const payload = (await response.json()) as { error?: { code?: string } }

  return payload.error?.code
}
