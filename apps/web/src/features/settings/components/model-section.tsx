import { useQuery } from '@tanstack/react-query'
import type { ModelPreferences } from '@workspace/contracts'

import { providerListQueryOptions } from '@/features/chat/lib/provider-query'

import { modelRows } from '../utils/model-rows'
import { EmptyRow } from './empty-row'
import { ModelRow } from './model-row'
import { Section } from './section'

export function ModelSection({ preferences }: { preferences: ModelPreferences }) {
  // The catalog the providers actually report, not just the models already
  // decided about — otherwise the screen for deciding starts empty and stays
  // that way.
  const { data } = useQuery(providerListQueryOptions())
  const rows = modelRows(preferences, data?.providers ?? [])

  return (
    <Section
      title='Models'
      description='Every model your providers offer. Turn one off to keep it out of the picker.'
    >
      {rows.length === 0 ? (
        <EmptyRow>No models are available.</EmptyRow>
      ) : (
        rows.map((row) => <ModelRow key={row.key} row={row} />)
      )}
    </Section>
  )
}
