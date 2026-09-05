import { healthDescriptorSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { environmentClientFor, type Client } from '@/lib/client'
import { useEnvironmentsStore } from '@/lib/environments/state/store'

export async function readEnvironmentDescriptor(
  origin: string,
  signal: AbortSignal,
  client: Client = environmentClientFor(origin),
) {
  const { data, error } = await client.health.get({ fetch: { signal } })
  if (error) throw error
  signal.throwIfAborted()
  const descriptor = v.parse(healthDescriptorSchema, data)
  useEnvironmentsStore.getState().recordDescriptor(origin, descriptor)
  return descriptor
}
