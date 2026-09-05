import { environmentCommandMetadata } from '@workspace/client-core/commands/environment'
import { defineCommand } from '@/keymap/define-command'

export const environmentCommands = [
  defineCommand({
    ...environmentCommandMetadata['environment.switch'],
    run: ({ runtime }) => {
      runtime.shell.showEnvironmentDialog('switch')
      return { status: 'handled' }
    },
  }),
  defineCommand({
    ...environmentCommandMetadata['environment.connect'],
    run: ({ runtime }) => {
      runtime.shell.showEnvironmentDialog('connect')
      return { status: 'handled' }
    },
  }),
  defineCommand({
    ...environmentCommandMetadata['environment.disconnect'],
    run: ({ runtime }) => {
      runtime.shell.showEnvironmentDialog('disconnect')
      return { status: 'handled' }
    },
  }),
  defineCommand({
    ...environmentCommandMetadata['environment.openMachines'],
    run: ({ runtime }) => {
      runtime.shell.showMachines()
      return { status: 'handled' }
    },
  }),
]
