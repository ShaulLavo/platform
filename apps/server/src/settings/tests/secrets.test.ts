import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyProviderSecrets,
  extractProviderSecrets,
  providerEnvSecretRef,
  SecretStore,
} from '../secrets'

const roots: string[] = []

async function tempStore() {
  const root = await mkdtemp(path.join(tmpdir(), 'settings-secrets-'))
  roots.push(root)
  const filePath = path.join(root, 'secrets.json')

  return { filePath, store: new SecretStore(filePath) }
}

const instances = [
  {
    providerInstanceId: 'codex-work',
    driverKind: 'codex',
    environment: [
      { name: 'OPENAI_API_KEY', value: 'sk-live-abc123' },
      { name: 'HTTP_PROXY', value: '' },
    ],
  },
]

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('SecretStore', () => {
  it('reads an absent file as empty', async () => {
    const { store } = await tempStore()

    expect(await store.read()).toEqual(new Map())
  })

  it('round-trips a secret', async () => {
    const { store } = await tempStore()
    const ref = providerEnvSecretRef('codex-work', 'OPENAI_API_KEY')

    await store.write(new Map([[ref, 'sk-live-abc123']]))

    expect((await store.read()).get(ref)).toBe('sk-live-abc123')
  })

  it('deletes rather than storing an emptied secret', async () => {
    const { store, filePath } = await tempStore()
    const ref = providerEnvSecretRef('codex-work', 'OPENAI_API_KEY')

    await store.write(new Map([[ref, 'sk-live-abc123']]))
    await store.write(new Map([[ref, null]]))

    expect((await store.read()).has(ref)).toBe(false)
    expect(await readFile(filePath, 'utf8')).not.toContain('sk-live')
  })

  it('keeps unrelated secrets across a write', async () => {
    const { store } = await tempStore()
    const one = providerEnvSecretRef('codex-work', 'OPENAI_API_KEY')
    const two = providerEnvSecretRef('claude-personal', 'ANTHROPIC_API_KEY')

    await store.write(new Map([[one, 'first']]))
    await store.write(new Map([[two, 'second']]))

    const stored = await store.read()
    expect(stored.get(one)).toBe('first')
    expect(stored.get(two)).toBe('second')
  })

  it('writes the file owner-only', async () => {
    const { store, filePath } = await tempStore()

    await store.write(new Map([[providerEnvSecretRef('a', 'B'), 'c']]))

    expect((await stat(filePath)).mode & 0o777).toBe(0o600)
  })
})

describe('provider secret extraction', () => {
  it('takes values out of the document and leaves the names behind', () => {
    const { instances: stripped, secrets } = extractProviderSecrets(instances)

    expect(JSON.stringify(stripped)).not.toContain('sk-live-abc123')
    // Presence stays legible: the variable is still named, with an empty value.
    expect(stripped).toEqual([
      {
        providerInstanceId: 'codex-work',
        driverKind: 'codex',
        environment: [
          { name: 'OPENAI_API_KEY', value: '' },
          { name: 'HTTP_PROXY', value: '' },
        ],
      },
    ])
    expect(secrets.get(providerEnvSecretRef('codex-work', 'OPENAI_API_KEY'))).toBe('sk-live-abc123')
  })

  it('records an empty value as a deletion rather than an empty secret', () => {
    const { secrets } = extractProviderSecrets(instances)

    expect(secrets.get(providerEnvSecretRef('codex-work', 'HTTP_PROXY'))).toBeNull()
  })

  it('restores stored values for the spawn path', () => {
    const { instances: stripped, secrets } = extractProviderSecrets(instances)
    const stored = new Map(
      [...secrets].filter(([, value]) => value !== null).map(([ref, value]) => [ref, value!]),
    )

    expect(applyProviderSecrets(stripped, stored)).toEqual(instances)
  })

  it('matches on name, not position, when variables are reordered', () => {
    const { secrets } = extractProviderSecrets(instances)
    const stored = new Map([
      [providerEnvSecretRef('codex-work', 'OPENAI_API_KEY'), 'sk-live-abc123'],
    ])
    const reordered = [
      {
        providerInstanceId: 'codex-work',
        driverKind: 'codex',
        environment: [
          { name: 'HTTP_PROXY', value: '' },
          { name: 'OPENAI_API_KEY', value: '' },
        ],
      },
    ]

    const restored = applyProviderSecrets(reordered, stored) as typeof reordered
    expect(restored[0].environment).toEqual([
      { name: 'HTTP_PROXY', value: '' },
      { name: 'OPENAI_API_KEY', value: 'sk-live-abc123' },
    ])
    expect(secrets.size).toBe(2)
  })

  it('does not carry a value onto a renamed variable', () => {
    const stored = new Map([
      [providerEnvSecretRef('codex-work', 'OPENAI_API_KEY'), 'sk-live-abc123'],
    ])
    const renamed = [
      {
        providerInstanceId: 'codex-work',
        driverKind: 'codex',
        environment: [{ name: 'OPENAI_TOKEN', value: '' }],
      },
    ]

    const restored = applyProviderSecrets(renamed, stored) as typeof renamed
    expect(restored[0].environment[0].value).toBe('')
  })

  it('leaves a shape it does not understand alone', () => {
    expect(extractProviderSecrets('not a list').instances).toBe('not a list')
    expect(applyProviderSecrets(null, new Map())).toBeNull()
  })
})
