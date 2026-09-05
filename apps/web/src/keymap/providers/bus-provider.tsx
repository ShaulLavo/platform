import { useState, type ReactNode } from 'react'

import { CommandBusContext } from '@/keymap/providers/bus-context'
import { createCommandBus } from '@/keymap/state/command-bus'
import type { CommandRuntimeBinding } from '@/keymap/state/runtime-binding'
import {
  captureCommandSnapshot,
  dispatchEditor,
  lookupPlatformCommand,
  resolveCommandTarget,
} from '@/keymap/state/runtime'

export function CommandBusProvider({
  binding,
  children,
}: {
  readonly binding: CommandRuntimeBinding
  readonly children: ReactNode
}) {
  const [bus] = useState(() =>
    createCommandBus({
      captureRuntime: binding.capture,
      captureSnapshot: captureCommandSnapshot,
      dispatchEditor,
      lookup: lookupPlatformCommand,
      now: () => performance.now(),
      resolveTarget: ({ entry, invocation, runtime, snapshot }) =>
        resolveCommandTarget(runtime, entry.target, invocation, snapshot),
      targetIsAvailable: (target, runtime) =>
        target.kind === 'workspace' || runtime.focus.isRegistered(target.token),
    }),
  )

  return <CommandBusContext value={{ binding, bus }}>{children}</CommandBusContext>
}
