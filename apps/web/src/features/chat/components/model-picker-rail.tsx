import type { ProviderInstanceId } from '@workspace/contracts'

import { ModelPickerRailItem } from '@/features/chat/components/model-picker-rail-item'
import type { ProviderModelOptionGroup } from '@/features/chat/lib/provider-model-options'

/**
 * Provider switcher down the left edge of the picker panel. Only worth showing
 * once a second provider instance exists — the panel decides that and renders
 * nothing here otherwise. Its scrollbar is hidden: the rail is 44px wide and a
 * gutter would eat a quarter of every glyph.
 */
export function ModelPickerRail({
  activeProviderInstanceId,
  groups,
  onSelect,
}: {
  readonly activeProviderInstanceId: ProviderInstanceId
  readonly groups: readonly ProviderModelOptionGroup[]
  readonly onSelect: (providerInstanceId: ProviderInstanceId) => void
}) {
  return (
    <div className='bg-muted w-11 shrink-0 overflow-hidden'>
      <div className='h-full overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <div className='relative flex min-h-full flex-col gap-1 p-1'>
          {groups.map((group) => (
            <ModelPickerRailItem
              active={group.providerInstanceId === activeProviderInstanceId}
              group={group}
              key={group.providerInstanceId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
