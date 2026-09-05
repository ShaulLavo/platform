import { errorStringField, type MachineDefinition } from '@workspace/contracts'
import { Button } from '@workspace/ui/components/button'
import { MachinePhase } from '@/components/machine-phase'
import { useState } from 'react'

import { MachineForm } from '@/features/settings/components/machine-form'
import { useSettingsActions } from '@/features/settings/hooks/use-settings-actions'
import { useEnvironmentConnections } from '@/hooks/use-environment-connections'
import { isDesktop } from '@/lib/platform/bridge'

export function MachineRow({
  name,
  machine,
  disabled,
}: {
  readonly name: string
  readonly machine: MachineDefinition
  readonly disabled: boolean
}) {
  const connections = useEnvironmentConnections()
  const state = connections.machines.find((entry) => entry.name === name)
  const phase = state?.phase ?? 'idle'
  const pending = phase === 'launching' || phase === 'connecting' || phase === 'reconnecting'
  const connected = phase === 'live' || pending
  const desktopOnly = machine.kind === 'ssh' && !isDesktop()
  const [editing, setEditing] = useState(false)
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { removeMachine } = useSettingsActions()
  const run = async (action: () => Promise<void>) => {
    setWorking(true)
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(
        errorStringField(error, 'message') ?? 'The machine action failed. Retry the connection.',
      )
    } finally {
      setWorking(false)
    }
  }
  const remove = async () => {
    await connections.disconnectMachine(name)
    const submission = removeMachine(name)
    if (submission.kind === 'noop') return
    if ((await submission.settled) === 'acknowledged') return
    setActionError('The machine could not be removed. Retry after resolving the settings error.')
  }
  if (editing) return <MachineForm name={name} machine={machine} onDone={() => setEditing(false)} />

  return (
    <div className='border-border flex flex-col gap-2 rounded-md border p-3'>
      <div className='flex items-center gap-2'>
        <MachinePhase label={machine.label ?? name} phase={phase} />
        <span className='min-w-0 flex-1 truncate text-sm font-medium'>{machine.label ?? name}</span>
        <span className='text-muted-foreground text-xs'>
          {desktopOnly ? 'Desktop only' : phase}
        </span>
      </div>
      <p className='text-muted-foreground truncate font-mono text-xs'>
        {name} · {machine.kind === 'ssh' ? machine.target : machine.url}
      </p>
      {machine.kind === 'ssh' ? (
        <p className='text-muted-foreground truncate font-mono text-xs'>{machine.repoPath}</p>
      ) : null}
      {state?.lastError ? (
        <p role='status' className='text-warning text-xs'>
          {state.lastError}
        </p>
      ) : null}
      {actionError ? (
        <p role='alert' className='text-destructive text-xs'>
          {actionError}
        </p>
      ) : null}
      <div className='flex flex-wrap items-center gap-1'>
        {connected ? (
          <Button
            size='sm'
            variant='secondary'
            disabled={working}
            onClick={() => void run(() => connections.disconnectMachine(name))}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size='sm'
            variant='secondary'
            disabled={working || desktopOnly}
            onClick={() => void run(() => connections.connectMachine(name))}
          >
            Connect
          </Button>
        )}
        {phase !== 'idle' && phase !== 'live' && !desktopOnly ? (
          <Button
            size='sm'
            variant='ghost'
            disabled={working}
            onClick={() => void run(() => connections.retryMachine(name))}
          >
            Retry now
          </Button>
        ) : null}
        <Button
          size='sm'
          variant='ghost'
          disabled={disabled || working || connected}
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={disabled || working}
          onClick={() => void run(remove)}
        >
          Remove
        </Button>
      </div>
    </div>
  )
}
