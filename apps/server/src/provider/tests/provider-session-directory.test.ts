import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as v from 'valibot'
import {
  DEFAULT_PROVIDER_DRIVER_KIND,
  DEFAULT_PROVIDER_INSTANCE_ID,
  DEFAULT_RUNTIME_MODE,
  threadIdSchema,
} from '@workspace/contracts'
import { migrateOrchestrationDatabase } from '../../db/migrations'
import * as schema from '../../db/schema'
import { ProviderSessionDirectory } from '../provider-session-directory'

describe('ProviderSessionDirectory', () => {
  it('merges runtime payloads and preserves resume cursors on upsert', () => {
    const fixture = createFixture()
    const directory = new ProviderSessionDirectory(fixture.database)
    const threadId = v.parse(threadIdSchema, 'thread-1')

    directory.upsert({
      adapterKey: 'codex',
      providerDriverKind: DEFAULT_PROVIDER_DRIVER_KIND,
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
      resumeCursor: { cursor: 'cursor-1' },
      runtimeMode: DEFAULT_RUNTIME_MODE,
      runtimePayload: { cwd: '/workspace', model: 'gpt-5-codex' },
      status: 'running',
      threadId,
    })
    directory.upsert({
      providerDriverKind: DEFAULT_PROVIDER_DRIVER_KIND,
      providerInstanceId: DEFAULT_PROVIDER_INSTANCE_ID,
      runtimePayload: { activeTurnId: 'turn-1' },
      threadId,
    })

    const binding = directory.getBinding(threadId)

    expect(binding?.resumeCursor).toEqual({ cursor: 'cursor-1' })
    expect(binding?.runtimePayload).toEqual({
      activeTurnId: 'turn-1',
      cwd: '/workspace',
      model: 'gpt-5-codex',
    })
    fixture.close()
  })
})

function createFixture() {
  const sqlite = new Database(':memory:', { create: true })
  const database = drizzle({ client: sqlite, schema })
  migrateOrchestrationDatabase(database)

  return {
    close: () => sqlite.close(),
    database,
  }
}
