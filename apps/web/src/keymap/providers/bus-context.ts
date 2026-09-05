import { createContext } from 'react'

import type { PlatformCommandBus } from '@/keymap/providers/command-context'
import type { CommandRuntimeBinding } from '@/keymap/state/runtime-binding'

export const CommandBusContext = createContext<{
  readonly binding: CommandRuntimeBinding
  readonly bus: PlatformCommandBus
} | null>(null)
