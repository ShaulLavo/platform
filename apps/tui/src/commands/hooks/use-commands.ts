import { useContext } from 'react'
import { createError } from 'evlog'

import { CommandContext } from '@/commands/providers/command-context'

export function useCommands() {
  const commands = useContext(CommandContext)
  if (commands) return commands
  throw createError({
    message: 'Command provider is missing.',
    why: 'A command surface mounted outside the terminal command owner.',
    fix: 'Mount the surface inside CommandProvider.',
  })
}
