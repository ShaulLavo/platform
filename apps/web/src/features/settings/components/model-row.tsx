import { Switch } from '@workspace/ui/components/switch'

import { useSettingsActions } from '../hooks/use-settings-actions'
import type { ModelRow as Row } from '../utils/model-rows'

export function ModelRow({ row }: { row: Row }) {
  const { isSaving, setModelHidden } = useSettingsActions()

  return (
    <div className='border-border flex items-center gap-3 border-b px-3 py-2 last:border-b-0'>
      <div className='flex min-w-0 flex-1 flex-col'>
        <span className='text-foreground truncate text-sm'>{row.ref.model}</span>
        <span className='text-muted-foreground truncate text-xs'>{row.ref.providerInstanceId}</span>
      </div>
      <Switch
        aria-label={`Show ${row.ref.model}`}
        checked={!row.hidden}
        disabled={isSaving}
        onCheckedChange={(checked) => setModelHidden(row.ref, !checked)}
      />
    </div>
  )
}
