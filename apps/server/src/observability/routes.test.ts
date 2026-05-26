import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'

import { LogReaderService } from './log-reader'
import { observabilityRoutes } from './routes'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('observability dashboard routes', () => {
  it('reads retained summary, paged history, and raw detail from the filesystem drain', async () => {
    const dir = await fixtureLogDir()
    await writeLogEvents(dir, [
      {
        action: 'fs.read',
        area: 'fs',
        level: 'info',
        source: 'be',
        timestamp: '2026-05-25T10:00:00.000Z',
      },
      {
        action: 'git.status',
        area: 'git',
        durationMs: 900,
        level: 'warn',
        source: 'be',
        timestamp: '2026-05-25T10:01:00.000Z',
      },
    ])
    const app = new Elysia().use(observabilityRoutes({ logs: new LogReaderService({ dir }) }))

    const summary = await app.handle(request('/_log/dashboard/summary?slowMs=500'))
    const events = await app.handle(request('/_log/dashboard/events?levels=warn&limit=1'))
    const eventPage = (await events.json()) as {
      detailsById: Record<string, { rawJson: Record<string, unknown> }>
      events: Array<{ id: string }>
      total: number
    }
    const detail = await app.handle(request(`/_log/dashboard/event?id=${eventPage.events[0].id}`))

    expect(summary.status).toBe(200)
    expect(await summary.json()).toMatchObject({
      slowCount: 1,
      total: 2,
      warnCount: 1,
    })
    expect(events.status).toBe(200)
    expect(eventPage.total).toBe(1)
    expect(eventPage.detailsById[eventPage.events[0].id]?.rawJson).toMatchObject({ area: 'git' })
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({
      event: { action: 'git.status', level: 'warn' },
      rawJson: { area: 'git' },
    })
  })
})

async function fixtureLogDir() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-log-routes-'))
  const dir = path.join(root, 'logs')
  roots.push(root)
  await mkdir(dir, { recursive: true })

  return dir
}

async function writeLogEvents(dir: string, events: readonly Record<string, unknown>[]) {
  await writeFile(
    path.join(dir, '2026-05-25.jsonl'),
    events.map((event) => JSON.stringify(event)).join('\n'),
  )
}

function request(pathname: string) {
  return new Request(`http://local${pathname}`)
}
