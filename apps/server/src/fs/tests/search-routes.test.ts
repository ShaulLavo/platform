import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createApp } from '../../app'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('GET /fs/search/events', () => {
  it('streams filename match events followed by a done event', async () => {
    const root = await fixtureRoot({
      'src/button.ts': 'export const Button = 1',
      'src/other.ts': 'unrelated',
    })
    const events = await search(root, { query: 'button' })

    const matches = events.filter((event) => event.type === 'match')
    expect(matches).toContainEqual(
      expect.objectContaining({
        match: expect.objectContaining({ kind: 'name', path: 'src/button.ts' }),
      }),
    )

    const done = events.at(-1)
    expect(done).toMatchObject({ type: 'done', query: 'button', truncated: false })
    expect(done?.count).toBe(matches.length)
  })

  it('streams content matches when content search is enabled', async () => {
    const root = await fixtureRoot({ 'notes.txt': 'find the needle here' })
    const events = await search(root, {
      query: 'needle',
      includeContent: 'true',
      includeNames: 'false',
    })

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'match',
        match: expect.objectContaining({ kind: 'content', path: 'notes.txt' }),
      }),
    )
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('restricts filename matches to the requested entry type', async () => {
    const root = await fixtureRoot({ 'shared/index.ts': 'x' })
    await mkdir(path.join(root, 'shared-utils'), { recursive: true })

    const events = await search(root, { query: 'shared', entryType: 'directory' })
    const matchPaths = events
      .filter((event) => event.type === 'match')
      .map((event) => event.match as { path: string; type: string })

    expect(matchPaths.length).toBeGreaterThan(0)
    for (const match of matchPaths) {
      expect(match.type).toBe('directory')
    }
  })

  it('omits matches inside gitignored directories', async () => {
    const root = await fixtureRoot({
      '.gitignore': 'ignored/\n',
      'ignored/button.ts': 'export const Button = 1',
      'src/button.ts': 'export const Button = 1',
    })

    const events = await search(root, { query: 'button' })
    const paths = events
      .filter((event) => event.type === 'match')
      .map((event) => (event.match as { path: string }).path)

    expect(paths).toContain('src/button.ts')
    expect(paths).not.toContain('ignored/button.ts')
  })

  it('reports truncation in the done event when the limit is reached', async () => {
    const root = await fixtureRoot({
      'button-a.ts': '1',
      'button-b.ts': '1',
      'button-c.ts': '1',
    })

    const events = await search(root, { query: 'button', limit: '1' })
    const matches = events.filter((event) => event.type === 'match')

    expect(matches).toHaveLength(1)
    expect(events.at(-1)).toMatchObject({ type: 'done', truncated: true, count: 1 })
  })
})

type SseEvent = { type: string } & Record<string, unknown>

async function search(root: string, query: Record<string, string>) {
  const app = createApp({
    auth: { allowedOrigins: [TRUSTED_ORIGIN] },
    watch: false,
    workspaceRoot: root,
  })

  const params = new URLSearchParams(query)
  const response = await app.handle(
    new Request(`http://local/fs/search/events?${params.toString()}`, {
      headers: { origin: TRUSTED_ORIGIN },
    }),
  )

  expect(response.status).toBe(200)
  return readSseEvents(response)
}

async function readSseEvents(response: Response): Promise<SseEvent[]> {
  const text = await response.text()
  const events: SseEvent[] = []

  for (const block of text.split('\n\n')) {
    const lines = block.split(/\r?\n/)
    const eventLine = lines.find((line) => line.startsWith('event:'))
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
    if (!eventLine || dataLines.length === 0) continue

    const type = eventLine.slice(6).trim()
    const data = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
    events.push({ type, ...data })
  }

  return events
}

async function fixtureRoot(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-search-route-'))
  roots.push(root)

  for (const [relativePath, contents] of Object.entries(files)) {
    const fileName = path.join(root, relativePath)
    await mkdir(path.dirname(fileName), { recursive: true })
    await writeFile(fileName, contents)
  }

  return root
}
