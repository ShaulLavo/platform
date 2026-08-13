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
 * The catalogue is read *unfiltered* — no preferences are passed to
 * `providerModelOptions`, whose job in the picker is to subtract the hidden
 * models. Subtracting them here would mean the switch that hides a model also
 * removes the row holding it, leaving no way to bring it back from the one
 * screen built to do that. `modelPreferenceRows` applies `hidden` as a flag
 * instead, which is what this screen exists to toggle.
 */
export function ModelSection({ settingId }: { settingId: SettingId }) {
  const { data } = useQuery(providerListQueryOptions())
  const hidden = useSettingValue('models.hidden')
  const order = useSettingValue('models.order')
  const rows = modelPreferenceRows(providerModelOptions(data?.providers), { hidden, order })

  if (rows.length === 0) return <EmptyRow>No models are available yet.</EmptyRow>

  // A move is one place in *this* sequence, so the rows are what it is computed
  // against — the stored order is sparse and cannot describe the screen.
  const displayed = rows.map((row) => row.ref)

  return (
    <div className='border-border flex max-h-64 w-96 flex-col overflow-y-auto rounded-md border'>
      {rows.map((row, index) => (
        <ModelRow
          canMoveDown={index < rows.length - 1}
          canMoveUp={index > 0}
          displayed={displayed}
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
