import { CaretDownIcon } from '@phosphor-icons/react'

export function ProviderModelPicker({
  busy,
  disabled,
  modelLabel,
}: {
  busy: boolean
  disabled: boolean
  modelLabel: string
}) {
  return (
    <button
      className='text-muted-foreground hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-7 max-w-36 items-center gap-1 truncate rounded-md px-2 text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
      disabled={disabled}
      title={modelLabel}
      type='button'
    >
      <span className='truncate'>{modelLabel}</span>
      <CaretDownIcon className='size-3 shrink-0' />
      {busy ? <span className='size-1.5 shrink-0 rounded-full bg-emerald-400' /> : null}
    </button>
  )
}
