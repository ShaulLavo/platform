import { closeChatTransportsForEnvironmentSwitch } from '@/features/chat/state/active-transports'
import { resetLanguageServerConnectionPool } from '@/features/editor/state/language-server-connection-pool'
import { createEditorRuntime, type EditorRuntime } from '@/features/editor/state/runtime'
import type { QueryClient } from '@tanstack/react-query'
import type { EditorPreparedEnvironment } from '@/features/editor/utils/prepared-document'
import { readWorkspaceCache, type CachedWorkspaceState } from '@/features/workspace/state/cache'
import { activateWorkspaceRoot } from '@/features/workspace/state/active-project'
import { createCommandRuntimeBinding } from '@/keymap/state/runtime-binding'
import { activeServerOrigin, canonicalServerOrigin } from '@/lib/client'
import {
  resumeEnvironmentActivity,
  suspendEnvironmentActivity,
} from '@/lib/environments/state/activity'
import { queryClientFor } from '@/lib/environments/state/query-clients'
import { useEnvironmentsStore } from '@/lib/environments/state/store'

type RetainedEnvironment = {
  readonly origin: string
  readonly queryClient: QueryClient
  readonly editor: EditorRuntime
  readonly unsubscribeRoot: () => void
}

export function createApplicationRuntime({
  workspaceCache,
  preparation,
}: {
  readonly workspaceCache: CachedWorkspaceState
  readonly preparation: EditorPreparedEnvironment
}) {
  const commandBinding = createCommandRuntimeBinding()
  const environments = new Map<string, RetainedEnvironment>()
  let current: RetainedEnvironment

  function createEnvironment(
    origin: string,
    seed: CachedWorkspaceState,
    restoreAddress = true,
  ): RetainedEnvironment {
    const queryClient = queryClientFor(origin)
    const editor = createEditorRuntime({
      queryClient,
      workspaceCache: seed,
      preparation,
      restoreAddress,
    })
    queryClient.mount()
    return {
      origin,
      queryClient,
      editor,
      unsubscribeRoot: editor.workspaceStore.subscribe(
        (state) => state.rootFolder?.path ?? null,
        (root) => {
          if (current.editor === editor) activateWorkspaceRoot(root)
        },
      ),
    }
  }

  current = createEnvironment(activeServerOrigin(), workspaceCache)
  resumeEnvironmentActivity(current.origin)
  environments.set(current.origin, current)
  activateWorkspaceRoot(current.editor.workspaceStore.getState().rootFolder?.path ?? null)

  return {
    commandBinding,
    getSnapshot: () => current,
    subscribe: (listener: () => void) => useEnvironmentsStore.subscribe(listener),
    activateEnvironment(origin: string) {
      origin = canonicalServerOrigin(origin)
      if (current.origin === origin) return
      const next =
        environments.get(origin) ?? createEnvironment(origin, readWorkspaceCache(), false)
      environments.set(origin, next)
      commandBinding.clear()
      suspendEnvironmentActivity(current.origin)
      resetLanguageServerConnectionPool()
      current.editor.suspend()
      void current.queryClient.cancelQueries()
      closeChatTransportsForEnvironmentSwitch()
      resumeEnvironmentActivity(origin)
      current = next
      activateWorkspaceRoot(current.editor.workspaceStore.getState().rootFolder?.path ?? null)
      useEnvironmentsStore.getState().activate(origin)
    },
    hasUnsavedDocuments: () =>
      [...environments.values()].some(({ editor }) => editor.hasUnsavedDocuments()),
    dispose() {
      commandBinding.clear()
      for (const environment of environments.values()) {
        suspendEnvironmentActivity(environment.origin)
        environment.unsubscribeRoot()
        environment.editor.dispose()
        environment.queryClient.unmount()
      }
      environments.clear()
      closeChatTransportsForEnvironmentSwitch()
      resetLanguageServerConnectionPool()
    },
  }
}

export type ApplicationRuntime = ReturnType<typeof createApplicationRuntime>
