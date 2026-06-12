import { CopyIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@workspace/ui/components/button'

type ProofEventLogProps = {
  readonly events: readonly string[]
  readonly stateEvents: readonly string[]
}

export function ProofEventLog({ events, stateEvents }: ProofEventLogProps) {
  const [copied, setCopied] = useState(false)
  const copiedResetRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (copiedResetRef.current === null) return

      window.clearTimeout(copiedResetRef.current)
    }
  }, [])

  async function copyLog() {
    await navigator.clipboard.writeText(proofEventLogText(events, stateEvents))
    setCopied(true)
    if (copiedResetRef.current !== null) {
      window.clearTimeout(copiedResetRef.current)
    }
    copiedResetRef.current = window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <aside className='bg-card border-border text-muted-foreground max-h-full overflow-auto rounded-md border p-3 text-xs'>
      <div className='mb-3 flex items-center justify-between gap-2'>
        <div className='text-foreground font-medium'>Logs</div>
        <Button
          aria-label='Copy proof logs'
          className='h-7 gap-1.5 px-2 text-xs'
          size='sm'
          type='button'
          variant='outline'
          onClick={() => void copyLog()}
        >
          <CopyIcon className='size-3' />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <section>
        <div className='text-foreground mb-2 font-medium'>Optimistic model log</div>
        <ol className='space-y-1'>
          {events.map((event, index) => (
            <li key={`${event}-${index}`}>{event}</li>
          ))}
        </ol>
      </section>
      <section className='border-border mt-4 border-t pt-3'>
        <div className='text-foreground mb-2 font-medium'>State after moves</div>
        {stateEvents.length === 0 ? (
          <div>No moves yet</div>
        ) : (
          <ol className='space-y-1 font-mono text-[0.68rem] leading-4'>
            {stateEvents.map((event, index) => (
              <li key={`${event}-${index}`}>{event}</li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  )
}

function proofEventLogText(events: readonly string[], stateEvents: readonly string[]) {
  return [
    'Optimistic model log',
    ...events,
    '',
    'State after moves',
    ...(stateEvents.length === 0 ? ['No moves yet'] : stateEvents),
  ].join('\n')
}
