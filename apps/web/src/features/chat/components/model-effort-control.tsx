import { ModelEffortChip } from '@/features/chat/components/model-effort-chip'
import { useModelPicker } from '@/features/chat/hooks/use-model-picker'
import {
  modelEffortDescriptor,
  modelSelectionOptionValue,
  type ModelEffortLevel,
} from '@/features/chat/lib/model-effort'

/**
 * Reasoning level for the selected model, as a footer under the model list.
 * Renders nothing when the model advertises no levels — the levels come from the
 * provider's own catalog, so there is no house set to fall back to.
 *
 * The level is read through the option descriptor rather than by reaching into
 * `options.reasoningEffort`, so this control and the composer's option menu can
 * never disagree about where the value lives.
 *
 * The model's default is shown as pressed while nothing is chosen, but is not
 * written into the selection: adapters read an absent level as "send no effort",
 * and preselecting one for real would start pinning it behind the user's back.
 *
 * One scrolling row, never a wrap: Claude advertises seven levels, which would
 * wrap into a third of this 346px panel and push the model list off screen.
 */
export function ModelEffortControl({
  defaultEffort,
  levels,
}: {
  readonly defaultEffort: string | null
  readonly levels: readonly ModelEffortLevel[]
}) {
  const { modelSelection, selectEffort } = useModelPicker()
  if (levels.length === 0) return null

  const descriptor = modelEffortDescriptor({ defaultEffort, effortLevels: levels })
  const activeEffort =
    modelSelectionOptionValue(modelSelection, descriptor) ?? descriptor.defaultValue

  return (
    <div className='border-border/70 flex items-center gap-1.5 border-t px-2 py-1.5'>
      <span className='text-muted-foreground/70 shrink-0 text-[10px] leading-none font-medium tracking-wide uppercase'>
        Effort
      </span>
      <div className='flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {levels.map((level) => (
          <ModelEffortChip
            key={level.effort}
            level={level}
            pressed={level.effort === activeEffort}
            onSelect={selectEffort}
          />
        ))}
      </div>
    </div>
  )
}
