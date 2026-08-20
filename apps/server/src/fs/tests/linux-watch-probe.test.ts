import { watch } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { WatchServerMessage } from '../contracts'
import { createWorkspacePaths } from '../path'
import { FileChangeHub } from '../watch'

// TEMPORARY PROBE. Records what the platform actually does rather than
// asserting an expectation, so one CI run answers why two writes to the same
// file produce one event on Linux and two on macOS. Reports through
// `expect.fail` because Vitest's console interception does not surface
// `console.log` from a passing test. Delete once the real fix lands.
function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function probeRoot() {
  return mkdtemp(path.join(tmpdir(), 'linux-watch-probe-'))
}

async function stamps(target: string) {
  const info = await stat(target)
  return { mtimeMs: info.mtimeMs, birthtimeMs: info.birthtimeMs }
}

describe('linux watch probe', () => {
  it('reports raw fs.watch events for two consecutive writes', async () => {
    const root = await probeRoot()
    const file = path.join(root, 'edited.txt')
    await writeFile(file, 'one')
    await delay(2)

    const started = Date.now()
    const seen: string[] = []
    const watcher = watch(root, { recursive: true }, (eventType, filename) => {
      seen.push(`+${Date.now() - started}ms ${eventType}:${filename}`)
    })
    const attachedAtMs = Date.now()
    await delay(50)

    await writeFile(file, 'two')
    const afterFirst = await stamps(file)
    await delay(500)
    const seenAfterFirst = [...seen]

    await writeFile(file, 'three three three')
    const afterSecond = await stamps(file)
    await delay(1500)

    watcher.close()
    await rm(root, { recursive: true, force: true })

    expect.fail(
      `RAW ${JSON.stringify({
        platform: process.platform,
        attachedAtMs,
        afterFirst,
        afterSecond,
        seenAfterFirst,
        seenAfterSecond: seen,
      })}`,
    )
  })

  it('reports FileChangeHub events for two consecutive writes', async () => {
    const root = await probeRoot()
    const file = path.join(root, 'edited.txt')
    await writeFile(file, 'one')
    await delay(2)

    const hub = new FileChangeHub(createWorkspacePaths(root), { backend: 'node', enabled: true })
    const abort = new AbortController()
    const stream = hub.stream([''], abort.signal)[Symbol.asyncIterator]()

    const started = Date.now()
    const received: string[] = []
    const pump = (async () => {
      while (true) {
        const next = await stream.next()
        if (next.done) return

        const event = next.value as WatchServerMessage & { path?: string }
        received.push(`+${Date.now() - started}ms ${event.type}:${event.path ?? ''}`)
      }
    })()

    await delay(100)
    await writeFile(file, 'two')
    await delay(600)
    const receivedAfterFirst = [...received]

    await writeFile(file, 'three three three')
    await delay(1500)

    abort.abort()
    await stream.return?.()
    await hub.close()
    await pump.catch(() => {})
    await rm(root, { recursive: true, force: true })

    expect.fail(
      `HUB ${JSON.stringify({
        platform: process.platform,
        info: hub.info(),
        receivedAfterFirst,
        receivedAfterSecond: received,
      })}`,
    )
  })
})
