import { ArrowClockwiseIcon, PlusIcon, SquaresFourIcon, TabsIcon } from '@phosphor-icons/react'

import { PROOF_SCENARIOS, type ProofScenario } from '@/features/dnd-proof/utils/model'
import { Button } from '@workspace/ui/components/button'

export function ProofToolbar({
  surfaceCount,
  windowCount,
  onAddTab,
  onAddWindow,
  onReset,
  onScenario,
}: {
  readonly surfaceCount: number
  readonly windowCount: number
  readonly onAddTab: () => void
  readonly onAddWindow: () => void
  readonly onReset: () => void
  readonly onScenario: (scenario: ProofScenario) => void
}) {
  return (
    <header className='border-border flex h-16 shrink-0 items-center justify-between border-b px-4'>
      <div className='min-w-0'>
        <h1 className='truncate text-sm font-medium'>dnd-kit tiling proof</h1>
        <p className='text-muted-foreground text-xs'>
          {windowCount} windows / {surfaceCount} tabs
        </p>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <div className='border-border flex items-center border'>
          {PROOF_SCENARIOS.map((scenario) => (
            <Button
              className='border-border border-r last:border-r-0'
              key={scenario}
              size='sm'
              type='button'
              variant='ghost'
              onClick={() => onScenario(scenario)}
            >
              <SquaresFourIcon className='size-3.5' />
              {scenario}
            </Button>
          ))}
        </div>
        <Button size='sm' type='button' variant='outline' onClick={onAddWindow}>
          <PlusIcon className='size-3.5' />
          Window
        </Button>
        <Button size='sm' type='button' variant='outline' onClick={onAddTab}>
          <TabsIcon className='size-3.5' />
          Tab
        </Button>
        <Button size='sm' type='button' variant='outline' onClick={onReset}>
          <ArrowClockwiseIcon className='size-3.5' />
          Reset
        </Button>
      </div>
    </header>
  )
}
