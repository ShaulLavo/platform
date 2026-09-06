import { createEnvironmentClient } from '@workspace/client-core/transport/client'
import { mkdir, writeFile } from 'node:fs/promises'

import { createFileBrowser } from '@/files/state/browser'
import { openFileStorage } from '@/storage/files'
import { createControlledInProcessTransport } from '../../../test/client'
import { readEnvironmentDescriptor } from '@workspace/client-core/environments/descriptor'
import { createEnvironmentsStore } from '@workspace/client-core/environments/state/store'
import { test, expect } from '../../../test/fixtures'
import { createTestSettingsSession } from '../../../test/factories/session'
import type { FileLocation } from '@/files/utils/list'

test('cancelled initial path discovery cannot replace a newer folder listing', async ({
  server,
  client,
}) => {
  const descriptor = await readEnvironmentDescriptor({
    client,
    origin: server.origin,
    environments: createEnvironmentsStore({ primaryOrigin: server.origin }),
    signal: new AbortController().signal,
  })
  const storage = await openFileStorage(`${server.root}/tui`, descriptor.environmentId)
  const transport = createControlledInProcessTransport(server)
  const controlledClient = createEnvironmentClient({
    origin: server.origin,
    fetcher: transport.fetcher,
    headers: () => ({ origin: server.clientOrigin }),
  })
  const browser = createFileBrowser(controlledClient, storage)
  const gate = transport.pauseNextResponse('/health')
  try {
    const opening = browser.open()
    await gate.reached
    await browser.navigate('')
    const current = browser.getSnapshot()
    expect(current.listing.kind).toBe('ready')
    gate.release()
    await opening
    expect(browser.getSnapshot()).toBe(current)
  } finally {
    gate.release()
    browser.dispose()
    storage.close()
  }
})

test('initial file preview publishes only its confirmed file location and failed navigation adds none', async ({
  server,
  client,
}) => {
  await mkdir(`${server.root}/docs`)
  await writeFile(`${server.root}/docs/guide.md`, 'Guide contents')
  const session = createTestSettingsSession(server)
  await session.refresh()
  const state = session.getSnapshot()
  if (state.kind !== 'ready') return expect.unreachable('Expected a ready session')
  const browser = createFileBrowser(client, state.storage)
  const locations: FileLocation[] = []
  browser.subscribe(() => {
    const location = browser.getSnapshot().location
    if (location && location !== locations.at(-1)) locations.push(location)
  })
  try {
    await browser.open('docs/guide.md')
    expect(locations).toEqual([
      { path: 'docs/guide.md', rootPath: browser.getSnapshot().paths?.defaultPath, kind: 'file' },
    ])
    await browser.navigate('missing-directory')
    expect(browser.getSnapshot().listing.kind).toBe('failed')
    expect(locations).toHaveLength(1)
    await browser.navigate('docs')
    expect(locations.at(-1)).toMatchObject({ path: 'docs', kind: 'directory' })
  } finally {
    browser.dispose()
    session.dispose()
    await state.storage.flush()
  }
})

test('navigation cancels pending path completion without replacing the input', async ({
  server,
}) => {
  await mkdir(`${server.root}/docs`)
  const session = createTestSettingsSession(server)
  await session.refresh()
  const state = session.getSnapshot()
  if (state.kind !== 'ready') return expect.unreachable('Expected a ready session')
  const transport = createControlledInProcessTransport(server)
  const client = createEnvironmentClient({
    origin: server.origin,
    fetcher: transport.fetcher,
    headers: () => ({ origin: server.clientOrigin }),
  })
  const browser = createFileBrowser(client, state.storage)
  await browser.open()
  const gate = transport.pauseNextResponse('/fs/tree')
  try {
    const input = `${server.root}/do`
    const completion = browser.completePath(input)
    await gate.reached
    await browser.navigate('docs')
    gate.release()
    expect(await completion).toBe(input)
    expect(browser.getSnapshot().location).toMatchObject({ path: 'docs', kind: 'directory' })
  } finally {
    gate.release()
    browser.dispose()
    session.dispose()
    await state.storage.flush()
  }
})
