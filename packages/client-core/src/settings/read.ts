import { settingsSnapshotSchema, type SettingsSnapshot } from '@workspace/contracts'
import * as v from 'valibot'
import type { Client } from '../transport/client'
import { createRpcError } from '../transport/rpc-error'

export async function readSettings({
  client,
  signal,
}: {
  readonly client: Client
  readonly signal?: AbortSignal
}): Promise<SettingsSnapshot> {
  const { data, error } = await client.settings.get({ fetch: { signal } })
  if (error) throw createRpcError(error)
  signal?.throwIfAborted()
  return v.parse(settingsSnapshotSchema, data)
}
