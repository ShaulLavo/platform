import { Elysia } from 'elysia'
import { providerListResultSchema } from '@workspace/contracts'
import type { ProviderRegistry } from './registry'

export function providerRoutes(registry: ProviderRegistry) {
  return new Elysia({ name: 'provider-routes' }).get('/providers', () => registry.listProviders(), {
    response: providerListResultSchema,
  })
}
