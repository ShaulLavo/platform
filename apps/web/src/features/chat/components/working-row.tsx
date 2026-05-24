import { CircleNotchIcon } from '@phosphor-icons/react'

export function WorkingRow() {
  return (
    <div className='flex justify-start'>
      <div className='bg-muted/35 text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs'>
        <CircleNotchIcon className='size-3.5 animate-spin' />
        Working
      </div>
    </div>
  )
}
