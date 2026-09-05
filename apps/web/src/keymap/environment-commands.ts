import { defineCommand } from '@/keymap/define-command'

export const environmentCommands = import.meta.env.DEV
  ? [
      defineCommand({
        id: 'environment.devSwitchOrigin',
        title: 'Switch local server',
        category: 'Developer',
        description: 'Switch to another local Platform server.',
        execution: 'sync',
        target: 'workspace',
        undoCategory: 'view-only',
        when: [],
        run: ({ runtime }) => {
          runtime.shell.showEnvironmentDialog()
          return { status: 'handled' }
        },
      }),
    ]
  : []
