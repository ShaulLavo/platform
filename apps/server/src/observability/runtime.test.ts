import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'
import { readFsLogs } from 'evlog/fs'
import type { WideEvent } from 'evlog'

import { createApp } from '../app'
import { flushObservability, initializeObservability, resetObservabilityForTests } from './runtime'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const roots: string[] = []

afterEach(async () => {
  await resetObservabilityForTests()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('observability runtime', () => {
  it('writes successful request events to the file drain and drops routine health checks', async () => {
    const root = await fixtureRoot()
    const logDir = await fixtureRoot()
    initializeObservability(testObservabilityEnv(logDir))
    const app = testApp(root)

    const health = await app.handle(
      new Request('http://local/health', {
        headers: trustedOriginHeaders(),
      }),
    )
    const tree = await app.handle(
      new Request('http://local/fs/tree?path=&depth=1', {
        headers: trustedOriginHeaders(),
      }),
    )

    expect(health.status).toBe(200)
    expect(tree.status).toBe(200)
    await health.text()
    await tree.text()
    const events = await flushedEvents(logDir)
    const paths = events.map((event) => event.path)
    const treeEvent = eventForPath(events, '/fs/tree')

    expect(paths).not.toContain('/health')
    expect(treeEvent).toMatchObject({
      fs: {
        operations: [
          expect.objectContaining({
            operation: 'tree',
            status: 'ok',
          }),
        ],
      },
      method: 'GET',
      source: 'be',
      status: 200,
    })
  })

  it('fans persisted request events out to PostHog when configured', async () => {
    const fetchRecorder = installFetchRecorder()

    try {
      const root = await fixtureRoot()
      const logDir = await fixtureRoot()
      initializeObservability(
        testObservabilityEnv(logDir, {
          OBSERVABILITY_POSTHOG_API_KEY: 'phc_test',
          OBSERVABILITY_POSTHOG_DISTINCT_ID: 'platform-test',
          OBSERVABILITY_POSTHOG_EVENT_NAME: 'platform_test_log',
          OBSERVABILITY_POSTHOG_HOST: 'https://posthog.test',
          OBSERVABILITY_POSTHOG_MODE: 'events',
        }),
      )
      const app = testApp(root)

      const response = await app.handle(
        new Request('http://local/fs/tree?path=&depth=1', {
          headers: trustedOriginHeaders(),
        }),
      )

      expect(response.status).toBe(200)
      await response.text()
      const event = eventForPath(await flushedEvents(logDir), '/fs/tree')
      const request = onlyPostHogRequest(fetchRecorder.requests)
      const payload = JSON.parse(request.body)

      expect(event).toMatchObject({
        path: '/fs/tree',
        source: 'be',
        status: 200,
      })
      expect(request.url).toBe('https://posthog.test/batch/')
      expect(payload).toMatchObject({
        api_key: 'phc_test',
        batch: [
          {
            distinct_id: 'platform-test',
            event: 'platform_test_log',
            properties: expect.objectContaining({
              path: '/fs/tree',
              service: 'platform',
              source: 'be',
            }),
          },
        ],
      })
    } finally {
      fetchRecorder.restore()
    }
  })

  it('keeps failed requests even when info sampling is disabled', async () => {
    const root = await fixtureRoot()
    const logDir = await fixtureRoot()
    initializeObservability(
      testObservabilityEnv(logDir, {
        OBSERVABILITY_INFO_SAMPLE_RATE: '0',
      }),
    )
    const app = testApp(root)

    const response = await app.handle(
      new Request('http://local/fs/read?path=missing.txt', {
        headers: trustedOriginHeaders(),
      }),
    )

    expect(response.status).toBe(404)
    await response.text()
    const event = eventForPath(await flushedEvents(logDir), '/fs/read')
    const serialized = JSON.stringify(event)

    expect(event).toMatchObject({
      error: {
        code: 'NOT_FOUND',
      },
      status: 404,
    })
    expect(serialized).not.toContain(root)
    expect(serialized).not.toContain(path.join(root, 'missing.txt'))
  })

  it('does not persist authorization secrets', async () => {
    const root = await fixtureRoot()
    const logDir = await fixtureRoot()
    const token = 'secret-session-token'
    initializeObservability(testObservabilityEnv(logDir))
    const app = testApp(root, { sessionToken: token })

    const response = await app.handle(
      new Request('http://local/fs/tree?path=&depth=1', {
        headers: trustedOriginHeaders({
          authorization: `Bearer ${token}`,
        }),
      }),
    )

    expect(response.status).toBe(200)
    await response.text()
    await flushObservability()
    const text = await readLogText(logDir)
    expect(text).not.toContain(token)
    expect(text.toLowerCase()).not.toContain('authorization')
  })

  it('persists client logs in the shared file drain with a frontend source marker', async () => {
    const root = await fixtureRoot()
    const logDir = await fixtureRoot()
    initializeObservability(testObservabilityEnv(logDir))
    const app = testApp(root)

    const response = await app.handle(
      new Request('http://local/_log/ingest', {
        body: JSON.stringify({
          action: 'client.test',
          area: 'test',
          content: 'SECRET_CLIENT_CONTENT',
          level: 'info',
          path: 'src/app.ts',
          service: 'platform-web',
          timestamp: new Date().toISOString(),
        }),
        headers: trustedOriginHeaders({ 'content-type': 'application/json' }),
        method: 'POST',
      }),
    )

    expect(response.status).toBe(204)
    await response.text()
    const events = await flushedEvents(logDir)
    const event = eventForAction(events, 'client.test')
    const serialized = JSON.stringify(events)

    expect(event).toMatchObject({
      action: 'client.test',
      area: 'test',
      client: {
        service: 'platform-web',
        timestamp: expect.any(String),
      },
      ingest: {
        method: 'POST',
        path: '/_log/ingest',
      },
      service: 'platform',
      source: 'fe',
    })
    expect(events.map((candidate) => candidate.path)).not.toContain('/_log/ingest')
    expect(serialized).not.toContain('SECRET_CLIENT_CONTENT')
  })

  it('records git and search summaries without persisting payload contents', async () => {
    const root = await fixtureRoot()
    const logDir = await fixtureRoot()
    const secretContent = 'needle TOP_SECRET_CONTENT'
    await writeFile(path.join(root, 'secret.txt'), secretContent)
    await initGitRepository(root)
    initializeObservability(testObservabilityEnv(logDir))
    const app = testApp(root)

    const search = await app.handle(
      new Request('http://local/fs/find?query=needle&includeContent=true', {
        headers: trustedOriginHeaders(),
      }),
    )
    const checkout = await app.handle(
      new Request('http://local/git/checkout', {
        body: JSON.stringify({ branch: 'missing-branch', path: '' }),
        headers: trustedOriginHeaders({ 'content-type': 'application/json' }),
        method: 'POST',
      }),
    )

    expect(search.status).toBe(200)
    expect(checkout.status).toBe(500)
    await search.text()
    await checkout.text()
    const events = await flushedEvents(logDir)
    const searchEvent = eventForPath(events, '/fs/find')
    const gitEvent = eventForPath(events, '/git/checkout')
    const serialized = JSON.stringify(events)

    expect(searchEvent.fs).toMatchObject({
      operations: [
        expect.objectContaining({
          matchCount: 1,
          search: expect.objectContaining({
            matchCount: 1,
            queryLength: 6,
          }),
        }),
      ],
    })
    expect(gitEvent.git).toMatchObject({
      commandCount: expect.any(Number),
      failedCommand: expect.objectContaining({
        action: 'checkout',
        exitCode: expect.any(Number),
      }),
    })
    expect(serialized).not.toContain('TOP_SECRET_CONTENT')
    expect(serialized).not.toContain('stdout')
  })
})

function testApp(root: string, options: { sessionToken?: string } = {}) {
  return createApp({
    auth: {
      allowedOrigins: [TRUSTED_ORIGIN],
      sessionToken: options.sessionToken,
    },
    watch: false,
    workspaceRoot: root,
  })
}

function testObservabilityEnv(logDir: string, overrides: Record<string, string> = {}) {
  return {
    OBSERVABILITY_CONSOLE: 'false',
    OBSERVABILITY_DIR: logDir,
    OBSERVABILITY_ENABLED: 'true',
    OBSERVABILITY_INFO_SAMPLE_RATE: '100',
    NODE_ENV: 'production',
    ...overrides,
  }
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'platform-observability-'))
  roots.push(root)
  return root
}

function trustedOriginHeaders(headers: HeadersInit = {}) {
  return {
    ...headers,
    origin: TRUSTED_ORIGIN,
  }
}

async function flushedEvents(logDir: string) {
  await delay(0)
  await flushObservability()
  return readEvents(logDir)
}

async function readEvents(logDir: string) {
  const events: WideEvent[] = []

  for await (const event of readFsLogs({ dir: logDir })) {
    events.push(event)
  }

  return events
}

function eventForPath(events: readonly WideEvent[], path: string) {
  const event = events.find((candidate) => candidate.path === path)
  if (!event) throw new Error(`missing observability event for ${path}`)

  return event as WideEvent & Record<string, unknown>
}

function eventForAction(events: readonly WideEvent[], action: string) {
  const event = events.find((candidate) => candidate.action === action)
  if (!event) throw new Error(`missing observability event for ${action}`)

  return event as WideEvent & Record<string, unknown>
}

async function readLogText(logDir: string) {
  const files = await readdir(logDir).catch(() => [])
  const chunks = await Promise.all(
    files
      .filter((file) => file.endsWith('.jsonl'))
      .map((file) => readFile(path.join(logDir, file), 'utf8')),
  )

  return chunks.join('\n')
}

async function initGitRepository(root: string) {
  await runGit(root, ['init'])
}

async function runGit(root: string, args: readonly string[]) {
  const process = Bun.spawn(['git', '-C', root].concat(args), {
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (exitCode === 0) return { stderr, stdout }

  throw new Error(`${stderr}${stdout}`.trim())
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type FetchRecorder = {
  requests: RecordedFetchRequest[]
  restore: () => void
}

type RecordedFetchRequest = {
  body: string
  url: string
}

function installFetchRecorder(): FetchRecorder {
  const originalFetch = globalThis.fetch
  const requests: RecordedFetchRequest[] = []

  globalThis.fetch = (async (input, init) => {
    requests.push({
      body: fetchBody(init),
      url: fetchUrl(input),
    })
    return new Response('{}', { status: 200 })
  }) as typeof fetch

  return {
    requests,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

function onlyPostHogRequest(requests: readonly RecordedFetchRequest[]) {
  expect(requests).toHaveLength(1)
  return requests[0]
}

function fetchBody(init: RequestInit | undefined) {
  return typeof init?.body === 'string' ? init.body : ''
}

function fetchUrl(input: RequestInfo | URL) {
  if (input instanceof Request) return input.url

  return String(input)
}
