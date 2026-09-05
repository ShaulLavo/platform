import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Spinner } from '@workspace/ui/components/spinner'

import { checkDevOrigin } from '@/features/environments/utils/dev-origin'
import { useApplicationRuntime } from '@/hooks/use-application-runtime'
import { toClientError } from '@/lib/client-error-taxonomy'
import { useEnvironmentsStore } from '@/lib/environments/state/store'

// Plan 078 replaces this development dialog with the Machines page.
export function DevOriginDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const application = useApplicationRuntime()
  const activeOrigin = useEnvironmentsStore((state) => state.activeOrigin)
  const entries = useEnvironmentsStore((state) => state.entries)
  const [value, setValue] = useState(activeOrigin)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  useEffect(() => () => request.current?.abort(), [])

  const switchOrigin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    try {
      const origin = await checkDevOrigin(value, controller.signal)
      onOpenChange(false)
      application.activateEnvironment(origin)
    } catch (cause) {
      if (!controller.signal.aborted) setError(toClientError(cause).message)
    } finally {
      if (!controller.signal.aborted) setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch local server</DialogTitle>
          <DialogDescription>
            Each server keeps its own files, changes, and unsaved edits.
          </DialogDescription>
        </DialogHeader>
        <form className='flex flex-col gap-4' onSubmit={switchOrigin}>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium' htmlFor='dev-origin'>
              Server origin
            </label>
            <Input
              id='dev-origin'
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder='http://127.0.0.1:3002'
              autoComplete='off'
            />
          </div>
          <div className='flex flex-col gap-1'>
            {Object.values(entries).map((entry) => (
              <Button
                key={entry.origin}
                type='button'
                variant='ghost'
                className='justify-start'
                onClick={() => setValue(entry.origin)}
              >
                {entry.label ?? entry.origin}
                {entry.origin === activeOrigin ? ' · current' : ''}
              </Button>
            ))}
          </div>
          {error ? (
            <p role='alert' className='text-destructive text-sm'>
              {error}
            </p>
          ) : null}
          <Button type='submit' disabled={pending}>
            {pending ? <Spinner /> : null}
            {pending ? 'Connecting…' : 'Switch server'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
