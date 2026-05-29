import { Elysia } from 'elysia'
import { providerListResultSchema } from '@workspace/contracts'
import type { ProviderAdapterRegistry } from './provider-adapter-registry'

export function providerRoutes(adapterRegistry: ProviderAdapterRegistry) {
  return new Elysia({ name: 'provider-routes' }).get(
    '/providers',
    () => adapterRegistry.listProviders(),
    {
      response: providerListResultSchema,
    },
  )
}
