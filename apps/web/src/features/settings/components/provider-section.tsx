import { useQuery } from '@tanstack/react-query'
import type { ProviderInstanceConfig } from '@workspace/contracts'

import { providerListQueryOptions } from '@/features/chat/lib/provider-query'

import { providerSettingRows } from '../utils/provider-rows'
import { EmptyRow } from './empty-row'
import { ProviderRow } from './provider-row'
import { Section } from './section'

export function ProviderSection({ saved }: { saved: readonly ProviderInstanceConfig[] }) {
  // The running providers, not the saved ones: the built-ins are registry
  // constants, so listing the settings document showed an empty screen while
  // two providers were live behind it.
  const { data } = useQuery(providerListQueryOptions())
  const instances = providerSettingRows({ saved, snapshots: data?.providers ?? [] })

  return (
    <Section
      title='Providers'
      description='Configured provider instances. Disabling one hides it everywhere without deleting its configuration.'
    >
      {instances.length === 0 ? (
        <EmptyRow>No providers are available.</EmptyRow>
      ) : (
        instances.map((instance) => (
          <ProviderRow key={instance.providerInstanceId} instance={instance} />
        ))
      )}
    </Section>
  )
}
