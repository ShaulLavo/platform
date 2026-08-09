import type { ProviderInstanceConfig } from '@workspace/contracts'

import { EmptyRow } from './empty-row'
import { ProviderRow } from './provider-row'
import { Section } from './section'

export function ProviderSection({ instances }: { instances: readonly ProviderInstanceConfig[] }) {
  return (
    <Section
      title='Providers'
      description='Configured provider instances. Disabling one hides it everywhere without deleting its configuration.'
    >
      {instances.length === 0 ? (
        <EmptyRow>No provider instances configured yet.</EmptyRow>
      ) : (
        instances.map((instance) => (
          <ProviderRow key={instance.providerInstanceId} instance={instance} />
        ))
      )}
    </Section>
  )
}
