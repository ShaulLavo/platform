import { healthDescriptorSchema, type HealthDescriptor } from '@workspace/contracts'
import * as v from 'valibot'
import type { StoreApi } from 'zustand/vanilla'
import type { Client } from '../transport/client'
import type { EnvironmentsStore } from './state/store'

export async function readEnvironmentDescriptor({
  origin,
  client,
  environments,
  signal,
}: {
  readonly origin: string
  readonly client: Client
  readonly environments: StoreApi<EnvironmentsStore>
  readonly signal: AbortSignal
}): Promise<HealthDescriptor> {
  const { data, error } = await client.health.get({ fetch: { signal } })
  if (error) throw error
  signal.throwIfAborted()
  const descriptor = v.parse(healthDescriptorSchema, data)
  environments.getState().recordDescriptor(origin, descriptor)
  return descriptor
}
