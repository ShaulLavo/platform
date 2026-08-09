import type { ModelPreferences } from '@workspace/contracts'

import { modelRows } from '../utils/model-rows'
import { EmptyRow } from './empty-row'
import { ModelRow } from './model-row'
import { Section } from './section'

export function ModelSection({ preferences }: { preferences: ModelPreferences }) {
  const rows = modelRows(preferences)

  return (
    <Section
      title='Models'
      description='Models you have pinned or hidden. Anything not listed stays visible in provider order.'
    >
      {rows.length === 0 ? (
        <EmptyRow>No model preferences yet.</EmptyRow>
      ) : (
        rows.map((row) => <ModelRow key={row.key} row={row} />)
      )}
    </Section>
  )
}
