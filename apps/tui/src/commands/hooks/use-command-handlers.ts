import { useLayoutEffect, useRef } from 'react'

import { useCommands } from '@/commands/hooks/use-commands'
import type { CommandBus, CommandHandlers } from '@/commands/state/bus'

export function useCommandHandlers(handlers: CommandHandlers, enabled = true) {
  const { bus } = useCommands()
  const registration = useRef<ReturnType<CommandBus['registerHandlers']> | null>(null)

  useLayoutEffect(() => {
    const owner = bus.registerHandlers({})
    registration.current = owner
    return () => {
      owner.unregister()
      registration.current = null
    }
  }, [bus])
  useLayoutEffect(() => {
    registration.current?.update(enabled ? handlers : {})
  }, [handlers, enabled])
}
