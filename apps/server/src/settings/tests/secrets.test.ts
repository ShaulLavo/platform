import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyProviderSecrets, providerEnvSecretRef, SecretStore } from '../secrets'

const roots: string[] = []

async function tempStore() {
  const root = await mkdtemp(path.join(tmpdir(), 'settings-secrets-'))
  roots.push(root)
  const filePath = path.join(root, 'secrets.json')

  return { filePath, store: new SecretStore(filePath) }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('SecretStore', () => {
  it('reads an absent file as empty', async () => {
    const { store } = await tempStore()

    expect(await store.read()).toEqual(new Map())
  })

  it('prepares the complete next secret document without writing it', async () => {
    const { store } = await tempStore()
    const ref = providerEnvSecretRef('codex-work', 'OPENAI_API_KEY')

    const prepared = await store.prepare(new Map([[ref, 'sk-live-abc123']]))

    expect(prepared.changed).toBe(true)
    expect(prepared.text).toContain('sk-live-abc123')
    expect(await store.read()).toEqual(new Map())
  })

  it('deletes rather than serializing an emptied secret', async () => {
    const { store, filePath } = await tempStore()
    const ref = providerEnvSecretRef('codex-work', 'OPENAI_API_KEY')
    await writeFile(filePath, `${JSON.stringify({ [ref]: 'sk-live-abc123' })}\n`, 'utf8')

    const prepared = await store.prepare(new Map([[ref, null]]))

    expect(prepared.text).not.toContain('sk-live')
  })

  it('keeps unrelated secrets in the prepared document', async () => {
    const { store, filePath } = await tempStore()
    const one = providerEnvSecretRef('codex-work', 'OPENAI_API_KEY')
    const two = providerEnvSecretRef('claude-personal', 'ANTHROPIC_API_KEY')
    await writeFile(filePath, `${JSON.stringify({ [one]: 'first' })}\n`, 'utf8')

    const prepared = await store.prepare(new Map([[two, 'second']]))

    expect(prepared.text).toContain('first')
    expect(prepared.text).toContain('second')
  })
})

describe('provider secret restoration', () => {
  it('matches on name, not position, when variables are reordered', () => {
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
    expect(applyProviderSecrets(null, new Map())).toBeNull()
  })
})
