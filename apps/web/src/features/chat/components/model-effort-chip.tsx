import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'

import type { ModelEffortLevel } from '@/features/chat/lib/model-effort'

/**
 * One reasoning level in the picker footer. Sized to the row badges rather than
 * to a normal button so the whole ladder fits the 360px panel on one line.
 */
export function ModelEffortChip({
  level,
  onSelect,
  pressed,
}: {
  readonly level: ModelEffortLevel
  readonly onSelect: (effort: string) => void
  readonly pressed: boolean
}) {
  const chip = (
    <Button
      aria-pressed={pressed}
      className='h-5 shrink-0 rounded-sm px-1.5 text-[10px] font-medium'
      size='xs'
      type='button'
      variant={pressed ? 'secondary' : 'ghost'}
      onClick={() => onSelect(level.effort)}
    >
      {level.label}
    </Button>
  )
  if (!level.description) return chip

  return (
    <Tooltip>
      <TooltipTrigger render={chip} />
      <TooltipContent align='center' className='max-w-64 leading-snug text-balance' side='top'>
        {level.description}
      </TooltipContent>
    </Tooltip>
  )
}
