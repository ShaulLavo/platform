import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { SettingsSnapshot } from '@workspace/contracts'
import { afterEach, describe, expect, it } from 'vitest'
import { SettingsStore } from '../store'

const stores: SettingsStore[] = []
const roots: string[] = []

async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'settings-watch-'))
  roots.push(root)

  return root
}

function createStore(
  root: string,
  options: { watch?: boolean; policy?: Record<string, unknown> } = {},
) {
  const store = new SettingsStore({
    policy: options.policy,
    userFilePath: path.join(root, 'settings.json'),
    watch: options.watch ?? true,
  })
  stores.push(store)

  return store
}

/** Resolves on the store's next change event, or rejects if it never comes. */
function nextChange(store: SettingsStore, timeoutMs = 2_000): Promise<SettingsSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error('settings store never reported a change'))
    }, timeoutMs)
    const stop = store.onChange((snapshot) => {
      clearTimeout(timer)
      stop()
      resolve(snapshot)
    })
  })
}

afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('external edits', () => {
  it('picks up a hand-edited file the store never wrote', async () => {
    const root = await tempRoot()
    const store = createStore(root)
    const changed = nextChange(store)

    await writeFile(
      path.join(root, 'settings.json'),
      '{\n  "keybindings.overrides": { "workspace.saveFile": "Mod+Alt+S" }\n}\n',
      'utf8',
    )

    const snapshot = await changed
    expect(snapshot.values['keybindings.overrides']).toEqual({
      'workspace.saveFile': 'Mod+Alt+S',
    })
  })

  it('survives the file being replaced rather than modified in place', async () => {
    const root = await tempRoot()
    const filePath = path.join(root, 'settings.json')
    await writeFile(filePath, '{ "keybindings.overrides": { "a.one": "Mod+1" } }', 'utf8')
    const store = createStore(root)

    const changed = nextChange(store)
    // An atomic save replaces the inode, which detaches a plain file watcher.
    // The directory watcher is what keeps this working.
    await rm(filePath)
    await writeFile(filePath, '{ "keybindings.overrides": { "a.two": "Mod+2" } }', 'utf8')

    const snapshot = await changed
    expect(snapshot.values['keybindings.overrides']).toEqual({ 'a.two': 'Mod+2' })
  })

  it('reports a change again after the file returns to content it once wrote', async () => {
    const root = await tempRoot()
    const filePath = path.join(root, 'settings.json')
    const store = createStore(root)

    await store.write({
      edits: [{ key: 'keybindings.overrides', target: 'user', value: { 'a.one': 'Mod+1' } }],
    })
    const written = await readFile(filePath, 'utf8')

    const away = nextChange(store)
    await writeFile(filePath, '{ "keybindings.overrides": { "a.one": "Mod+9" } }', 'utf8')
    expect((await away).values['keybindings.overrides']).toEqual({ 'a.one': 'Mod+9' })

    // Undo in the user's editor, restoring the exact bytes the store wrote. If
    // the echo-suppression hash is not cleared on every applied reload, this
    // event is swallowed forever and the store serves a value the file does not
    // hold — with `echoSuppressed` in the log making it look deliberate.
    const back = nextChange(store)
    await writeFile(filePath, written, 'utf8')

    expect((await back).values['keybindings.overrides']).toEqual({ 'a.one': 'Mod+1' })
  })

  it('does not report the echo of its own write', async () => {
    const root = await tempRoot()
    const store = createStore(root)
    const seen: number[] = []
    store.onChange(() => seen.push(1))

    await store.write({
      edits: [{ key: 'keybindings.overrides', target: 'user', value: { 'a.one': 'Mod+1' } }],
    })
    await new Promise((resolve) => setTimeout(resolve, 400))

    // Exactly one: the write itself. The watch event its own rename produced
    // must not arrive as a second, spurious change.
    expect(seen).toEqual([1])
  })
})

describe('a malformed file', () => {
  it('serves defaults and refuses to write, naming the file', async () => {
    const root = await tempRoot()
    await writeFile(path.join(root, 'settings.json'), '{ "keybindings.overrides": ', 'utf8')
    const store = createStore(root, { watch: false })

    // One bad file must not take the document down: the running app still needs
    // whatever keybindings it can get.
    expect(store.snapshot().values['keybindings.overrides']).toEqual({})

    await expect(
      store.write({ edits: [{ key: 'models.hidden', target: 'user', value: [] }] }),
    ).rejects.toMatchObject({ code: 'settings.FILE_MALFORMED' })
  })

  it('treats an empty file as an empty document and still writes', async () => {
    const root = await tempRoot()
    await writeFile(path.join(root, 'settings.json'), '', 'utf8')
    const store = createStore(root, { watch: false })

    // The most common outcome of a crashed editor save. Treating it as a parse
    // error would deadlock every write with no way back from inside the app.
    await expect(
      store.write({ edits: [{ key: 'models.hidden', target: 'user', value: [] }] }),
    ).resolves.toBeDefined()
  })
})

describe('the policy layer', () => {
  it('wins over the file and refuses a write to the key it owns', async () => {
    const root = await tempRoot()
    const store = createStore(root, {
      policy: { 'keybindings.overrides': { 'a.locked': 'Mod+L' } },
      watch: false,
    })

    expect(store.snapshot().values['keybindings.overrides']).toEqual({ 'a.locked': 'Mod+L' })
    // Accepting the write and then resolving back to the policy value would look
    // like a silent failure, which is worse than a refusal.
    await expect(
      store.write({ edits: [{ key: 'keybindings.overrides', target: 'user', value: {} }] }),
    ).rejects.toMatchObject({ code: 'settings.POLICY_CONTROLLED' })
  })
})

describe('the settings file itself', () => {
  it('is human-readable and holds only what was changed', async () => {
    const root = await tempRoot()
    const store = createStore(root, { watch: false })

    await store.write({
      edits: [{ key: 'keybindings.overrides', target: 'user', value: { 'a.one': 'Mod+1' } }],
    })

    const text = await readFile(path.join(root, 'settings.json'), 'utf8')
    expect(text).toContain('"keybindings.overrides"')
    // Untouched keys stay out of the file, which is what keeps a default live:
    // it comes from the running build rather than a copy frozen at write time.
    expect(text).not.toContain('models.hidden')
    expect(text).not.toContain('providers.instances')
  })
})

describe('a secrets file that cannot be read', () => {
  it('does not take the process down during a watch-driven reload', async () => {
    const root = await tempRoot()
    // Construct the store *before* the bad directory exists: `SettingsStore`'s
    // constructor also calls `secretStore.readSync()`, so creating the directory
    // first would throw here instead of on the reload path under test.
    const store = createStore(root)
    const secretsPath = path.join(root, 'secrets.json')
    // A directory where the file should be: `readFileSync` throws EISDIR, which
    // is not ENOENT, so `readSettingsFileSync` rethrows out of `invalidate()` —
    // straight into the detached reload. Before `runDetached` this killed Bun.
    await mkdir(secretsPath)

    await writeFile(path.join(root, 'settings.json'), '{ "models.hidden": ["alpha"] }', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 400))
    await rm(secretsPath, { recursive: true })

    // The process is still here, and the store still answers. What it does NOT
    // do is deliver the change that was in flight when the secrets read threw:
    // `invalidate()` clears `cachedSnapshot` and then reads secrets *before*
    // notifying, so the throw drops the notification. That is the honest state
    // after this fix — the crash is closed, the dropped change is not, and
    // closing it means deciding what stale `secretRefs` mean for redaction.
    await writeFile(path.join(root, 'settings.json'), '{ "models.hidden": ["beta"] }', 'utf8')
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(store.snapshot()).toBeDefined()
  })
})
