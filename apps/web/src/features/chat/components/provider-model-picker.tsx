import { CaretDownIcon, CheckIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import type { ModelSelection, ProviderSnapshot } from '@workspace/contracts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu'
import { cn } from '@workspace/ui/lib/utils'

import { providerModelDisplayLabel, providerStatusLabel } from '../lib/chat-formatters'
import {
  providerModelOptions,
  providerModelSelectionKey,
  type ProviderModelOption,
} from '../lib/provider-model-options'
import { providerListQueryOptions } from '../lib/provider-query'

export function ProviderModelPicker({
  busy,
  disabled,
  locked,
  modelSelection,
  onChange,
}: {
  busy: boolean
  disabled: boolean
  locked: boolean
  modelSelection: ModelSelection
  onChange: (modelSelection: ModelSelection) => void
}) {
  const providersQuery = useQuery(providerListQueryOptions())
  const options = providerModelOptions(providersQuery.data?.providers)
  const provider = providersQuery.data?.providers.find(
    (candidate) => candidate.providerInstanceId === modelSelection.providerInstanceId,
  )
  const modelLabel = providerModelDisplayLabel(provider, modelSelection)
  const statusLabel = providerStatusLabel(provider)
  const selectedKey = providerModelSelectionKey(modelSelection)
  const pickerDisabled = disabled || locked || options.length === 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            aria-label='Provider and model'
            className='text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-7 max-w-36 items-center gap-1 truncate rounded-md px-2 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
            disabled={pickerDisabled}
            title={providerPickerTitle({ locked, modelLabel, statusLabel })}
            type='button'
          />
        }
      >
        <span className='truncate'>{modelLabel}</span>
        <CaretDownIcon className='size-3 shrink-0' />
        <span
          aria-label={statusLabel}
          className={cn('size-1.5 shrink-0 rounded-full', providerStatusDotClass(provider, busy))}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-60 rounded-md p-1'>
        <DropdownMenuLabel>Provider</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuItem
            className='grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md px-2.5 py-2.5'
            disabled={!option.enabled}
            key={option.key}
            onClick={() => onChange(option.modelSelection)}
          >
            <span className='truncate font-medium'>{option.label}</span>
            {option.key === selectedKey ? (
              <CheckIcon className='text-foreground size-3.5' />
            ) : (
              <span className={cn('mt-1 size-1.5 rounded-full', optionStatusDotClass(option))} />
            )}
            <span className='text-muted-foreground col-span-2 truncate text-[11px]'>
              {option.providerLabel} · {option.statusLabel}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function providerStatusDotClass(provider: ProviderSnapshot | undefined, busy: boolean) {
  if (busy) return 'bg-info'
  if (!provider) return 'bg-muted-foreground/35'
  if (provider.status === 'ready') return 'bg-success'
  if (provider.status === 'warning') return 'bg-warning'

  return 'bg-destructive'
}

function optionStatusDotClass(option: ProviderModelOption) {
  return option.enabled ? 'bg-success' : 'bg-destructive'
}

function providerPickerTitle({
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
