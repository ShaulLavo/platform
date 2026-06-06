import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '../fixtures'

// Proves the phase-2 foundation: a real server, driven in-process through the
// typed eden client, against a real filesystem. No MSW, no mock.module.
test('health reports the real workspace root', async ({ client, server }) => {
  const { data, status } = await client.health.get()

  expect(status).toBe(200)
  expect(data).toMatchObject({ ok: true, workspaceRoot: server.root })
})

test('reads a file written to the real workspace', async ({ client, server }) => {
  await writeFile(path.join(server.root, 'hello.ts'), 'export const greeting = "hi"\n')

  const { data, status } = await client.fs.read.get({ query: { path: 'hello.ts' } })

  expect(status).toBe(200)
  expect(JSON.stringify(data)).toContain('export const greeting')
})

test('rejects requests from an untrusted origin', async ({ server }) => {
  const response = await server.app.handle(
    new Request('http://localhost:5173/health', { headers: { origin: 'http://evil.test' } }),
  )

  expect(response.status).toBe(403)
})
