import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsStore } from '../store'

const roots: string[] = []
const stores: SettingsStore[] = []

async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'settings-raw-'))
  roots.push(root)

  return root
}

function createStore(root: string) {
  const store = new SettingsStore({
    userFilePath: path.join(root, 'settings.json'),
    secretsFilePath: path.join(root, 'secrets.json'),
    watch: false,
  })
  stores.push(store)

  return store
}

afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

/**
 * The raw path is the only one that can repair a document the keyed path
 * refuses, so a raw save that refuses *itself* takes the last way out of a
 * broken settings file with it.
 */
describe('the revision a fresh install reports', () => {
  it('accepts the first raw save on a machine with no settings file', async () => {
    const store = createStore(await tempRoot())
    const { revision } = store.rawLayer('user')

    // `''` is what a file that does not exist reports; the disk reports `null`.
    expect(revision).toBe('')

    const snapshot = await store.writeRaw('user', '{ "editor.fontSize": 21 }\n', revision)
    expect(snapshot.values['editor.fontSize']).toBe(21)
  })

  it('still refuses a raw save whose base revision is genuinely stale', async () => {
    const root = await tempRoot()
    const store = createStore(root)
    await store.writeRaw('user', '{ "editor.fontSize": 20 }\n', '')

    await expect(
      store.writeRaw('user', '{ "editor.fontSize": 30 }\n', 'not-the-current-revision'),
    ).rejects.toMatchObject({ code: 'settings.REVISION_STALE' })
  })
})

/**
 * `expectedRevision` only means something if writes are ordered. Two that
 * overlap each read the same revision, each find it unchanged, and each rename
 * over the other — so the guard passes twice, both callers get a success, and
 * one edit is gone with nothing anywhere saying so.
 */
describe('two writes that overlap', () => {
  it('lets one through and refuses the other rather than losing an edit', async () => {
    const root = await tempRoot()
    const file = path.join(root, 'settings.json')
    await writeFile(file, '{}\n', 'utf8')

    const store = createStore(root)
    const base = store.snapshot().revision

    const outcomes = await Promise.allSettled([
      store.writeRaw('user', '{ "editor.fontSize": 20 }\n', base),
      store.writeRaw('user', '{ "editor.lineHeight": 30 }\n', base),
    ])

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
    const refused = outcomes.find((outcome) => outcome.status === 'rejected')
    expect(refused?.reason).toMatchObject({ code: 'settings.REVISION_STALE' })

    // Whichever won, the file is one of the two documents whole — never a third
    // one made of both, and never the loser's silently discarded.
    const onDisk = await readFile(file, 'utf8')
    expect(['{ "editor.fontSize": 20 }\n', '{ "editor.lineHeight": 30 }\n']).toContain(onDisk)
  })

  it('serializes writes that do not carry a base revision at all', async () => {
    const root = await tempRoot()
    await writeFile(path.join(root, 'settings.json'), '{}\n', 'utf8')
    const store = createStore(root)

    await Promise.all([
      store.write({ edits: [{ key: 'editor.fontSize', value: 20, target: 'user' }] }),
      store.write({ edits: [{ key: 'editor.lineHeight', value: 30, target: 'user' }] }),
    ])

    // Unguarded writes are allowed to both succeed — what they may not do is
    // interleave, which is what drops one of the two keys.
    const values = store.snapshot().values
    expect(values['editor.fontSize']).toBe(20)
    expect(values['editor.lineHeight']).toBe(30)
  })
})
