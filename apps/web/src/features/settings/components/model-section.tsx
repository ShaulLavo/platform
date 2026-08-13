import { useQuery } from '@tanstack/react-query'
import type { SettingId } from '@workspace/contracts'

import { modelPreferenceRows } from '@/features/chat/lib/model-preferences'
import { providerModelOptions } from '@/features/chat/lib/provider-model-options'
import { providerListQueryOptions } from '@/features/chat/lib/provider-query'

import { useSettingValue } from '../hooks/use-setting-value'
import { EmptyRow } from './empty-row'
import { ModelRow } from './model-row'

/**
 * The model list, as the control for both `models.hidden` and `models.order`.
 *
 * One list, two keys: hiding and ranking are the same decision made on the same
 * row, and two separate editors would make the user hold the mapping between
 * them in their head. The row it renders in tells it which key it is standing
 * for, so the page still reads as one setting per row.
 *
 * Sourced from the provider catalogue, not from the preferences. Deriving rows
 * from `hidden` meant the list could only contain models the user had already
 * hidden — so it started empty, and there was no way to hide anything from it.
 */
export function ModelSection({ settingId }: { settingId: SettingId }) {
  const { data } = useQuery(providerListQueryOptions())
  const hidden = useSettingValue('models.hidden')
  const order = useSettingValue('models.order')
  const rows = modelPreferenceRows(providerModelOptions(data?.providers, { hidden, order }), {
    hidden,
    order,
  })

  if (rows.length === 0) return <EmptyRow>No models are available yet.</EmptyRow>

  return (
    <div className='border-border flex max-h-64 w-96 flex-col overflow-y-auto rounded-md border'>
      {rows.map((row, index) => (
        <ModelRow
          canMoveDown={index < rows.length - 1}
          canMoveUp={index > 0}
          key={row.key}
          // Ranking controls only appear on the row that stands for the order
          // key, so the two settings stay distinguishable on the page.
          ranked={settingId === 'models.order'}
          row={row}
        />
      ))}
    </div>
  )
}
