import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog'
import { useEnvironmentConnections } from '@/hooks/use-environment-connections'
import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { errorMessage } from '@/lib/error-message'
import { isDesktop } from '@/lib/platform/bridge'

export function MachinePickerDialog({
  mode,
  onClose,
}: {
  readonly mode: 'switch' | 'connect' | 'disconnect'
  readonly onClose: () => void
}) {
  const connections = useEnvironmentConnections()
  const entries = useEnvironmentsStore((state) => state.entries)
  const [error, setError] = useState<string | null>(null)
  const desktop = isDesktop()
  const title = {
    switch: 'Switch machine',
    connect: 'Connect machine',
    disconnect: 'Disconnect machine',
  }[mode]
  const machines = connections.machines.filter((machine) =>
    mode === 'connect' ? machine.phase !== 'live' : machine.environmentId !== null,
  )
  const primary = Object.values(entries).find((entry) => entry.kind === 'primary')
  async function choose(name: string) {
    try {
      if (mode === 'connect') await connections.connectMachine(name)
      if (mode === 'disconnect') await connections.disconnectMachine(name)
      const machine = machines.find((entry) => entry.name === name)
      if (mode === 'switch' && machine?.environmentId)
        connections.activateEnvironment(machine.environmentId)
      onClose()
    } catch (cause) {
      setError(errorMessage(cause, 'The machine action failed.'))
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {mode === 'switch' && primary?.environmentId ? (
          <Button
            variant='ghost'
            onClick={() => {
              connections.activateEnvironment(primary.environmentId!)
              onClose()
            }}
          >
            {primary.label ?? 'Local machine'}
          </Button>
        ) : null}
        {machines.map((machine) => (
          <Button
            key={machine.name}
            variant='ghost'
            className='justify-between'
            disabled={mode === 'connect' && machine.config.kind === 'ssh' && !desktop}
            onClick={() => void choose(machine.name)}
          >
            <span>{machine.config.label ?? machine.name}</span>
            <span className='text-muted-foreground'>
              {machine.config.kind === 'ssh' && !desktop ? 'Desktop only' : machine.phase}
            </span>
          </Button>
        ))}
        {machines.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            No machines available. Add a machine in Settings.
          </p>
        ) : null}
        {error ? (
          <p role='alert' className='text-destructive text-sm'>
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
