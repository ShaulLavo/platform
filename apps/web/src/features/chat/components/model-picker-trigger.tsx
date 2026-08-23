import { CaretDownIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import type { ProviderSnapshot } from '@workspace/contracts'
import { PopoverTrigger } from '@workspace/ui/components/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'
import { cn } from '@workspace/ui/lib/utils'

import { ProviderGlyph } from '@/features/chat/components/provider-glyph'
import { useModelPicker } from '@/features/chat/hooks/use-model-picker'
import { providerModelDisplayLabel, providerStatusLabel } from '@/features/chat/utils/formatters'
import { providerRequiresSignIn } from '@/features/chat/utils/provider-auth'
import { providerListQueryOptions } from '@/features/chat/utils/provider-query'

/**
 * Composer control that opens the model picker. Stays interactive while the
 * provider list is still loading — the panel owns the loading and empty states,
 * so a slow query must never paint a dead grey button.
 */
export function ModelPickerTrigger({
  busy,
  disabled,
}: {
  readonly busy: boolean
  readonly disabled: boolean
}) {
  const { locked, modelSelection } = useModelPicker()
  const providersQuery = useQuery(providerListQueryOptions())
  const provider = providersQuery.data?.providers.find(
    (candidate) => candidate.providerInstanceId === modelSelection?.providerInstanceId,
  )
  // No ready provider offers a model yet. Stay openable — the rows carry the
  // sign-in and not-installed affordances the user needs to fix it.
  const modelLabel = modelSelection
    ? providerModelDisplayLabel(provider, modelSelection)
    : 'Select model'
  const statusLabel = triggerStatusLabel(provider)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <PopoverTrigger
            render={
              <button
                // A locked thread reports itself with aria-disabled rather than the
                // native attribute: a natively disabled button swallows pointer
                // events, so the tooltip explaining the lock would never open.
                aria-disabled={locked}
                aria-label='Provider and model'
                className='text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 compact:h-6 compact:px-1.5 flex h-7 max-w-44 items-center gap-1 truncate rounded-md px-2 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-default aria-disabled:opacity-50'
                disabled={disabled}
                type='button'
              />
            }
          >
            {provider ? (
              <ProviderGlyph
                className='size-3.5 text-[7px]'
                displayLabel={provider.displayLabel}
                driverKind={provider.driverKind}
              />
            ) : null}
            <span className='min-w-0 truncate'>{modelLabel}</span>
            <CaretDownIcon className='size-3 shrink-0' />
            <span
              aria-label={statusLabel}
              className={cn(
                'size-1.5 shrink-0 rounded-full',
                triggerStatusDotClass(provider, busy),
              )}
            />
          </PopoverTrigger>
        }
      />
      <TooltipContent>{triggerTooltipLabel({ locked, modelLabel, statusLabel })}</TooltipContent>
    </Tooltip>
  )
}

// Signed out is the one blocker the user can clear from the panel this trigger
// opens, so it outranks whatever generic status the snapshot carries.
function triggerStatusLabel(provider: ProviderSnapshot | undefined) {
  if (provider && providerRequiresSignIn(provider)) {
    return `${provider.displayLabel} sign-in required`
  }

  return providerStatusLabel(provider)
}

function triggerStatusDotClass(provider: ProviderSnapshot | undefined, busy: boolean) {
  if (busy) return 'bg-info'
  if (!provider) return 'bg-muted-foreground/35'
  if (providerRequiresSignIn(provider)) return 'bg-destructive'
  if (provider.status === 'ready') return 'bg-success'
  if (provider.status === 'warning') return 'bg-warning'

  return 'bg-destructive'
}

function triggerTooltipLabel({
  locked,
  modelLabel,
  statusLabel,
}: {
  locked: boolean
  modelLabel: string
  statusLabel: string
}) {
  if (locked) return `${modelLabel} - locked for this thread`

  return `${modelLabel} - ${statusLabel}`
}
