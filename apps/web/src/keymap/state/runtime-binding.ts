import type { WorkspaceCommandRuntime } from '@/keymap/define-command'

export function createCommandRuntimeBinding() {
  let current: WorkspaceCommandRuntime | null = null

  return {
    capture: () => current,
    clear: () => {
      current = null
    },
    bind: (runtime: WorkspaceCommandRuntime) => {
      current = runtime
      return () => {
        if (current === runtime) current = null
      }
    },
  }
}

export type CommandRuntimeBinding = ReturnType<typeof createCommandRuntimeBinding>
