import { useQueryClient } from '@tanstack/react-query'
import { LanguageServerDocumentSyncController } from '@singapor/lsp-plugin'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  WorkspaceEditHostContext,
  WorkspaceEditServiceContext,
} from '@/features/editor/providers/workspace-edit-context'
import { useEditorDocumentStoreApi } from '@/features/editor/state/document-state'
import { FileSyncService } from '@/features/editor/state/file-sync-service'
import { useEditorWorkspaceStoreApi } from '@/features/editor/state/workspace-state'
import { WorkspaceEditService } from '@/features/editor/state/workspace-edit-service'
import { log } from '@/lib/client-logging'

export function WorkspaceEditProvider({ children }: { readonly children: ReactNode }) {
  const documentStore = useEditorDocumentStoreApi()
  const workspaceStore = useEditorWorkspaceStoreApi()
  const queryClient = useQueryClient()
  const [rootGeneration] = useState(() => new WorkspaceRootGeneration())
  const [documentSyncController] = useState(() => new LanguageServerDocumentSyncController())
  const [service] = useState(
    () =>
      new WorkspaceEditService({
        documentStore,
        documentSyncController,
        fileSync: new FileSyncService(documentStore, queryClient),
        getRoot: () => {
          const root = workspaceStore.getState().rootFolder
          if (!root) return null
          return {
            generation: rootGeneration.current(),
            path: root.path,
            uriPath: workspaceEditUriPath(root.path),
            workspacePath: root.path,
          }
        },
      }),
  )

  useEffect(() => {
    const discover = () => {
      void service.discoverRecovery().catch((error) => {
        log.warn({
          action: 'workspace_edit.recovery_discovery_failed',
          area: 'workspace-edit',
          error,
        })
      })
    }
    discover()
    return workspaceStore.subscribe(
      (state) => state.rootFolder?.path ?? null,
      () => {
        rootGeneration.advance()
        service.resetForRoot()
        discover()
      },
    )
  }, [rootGeneration, service, workspaceStore])

  useEffect(() => () => service.dispose(), [service])

  const host = useMemo(
    () => ({
      documentSyncController,
      isOwnEvent: (writeId: string) => service.isOwnEvent(writeId),
      onApplyWorkspaceEdit: service.onApplyWorkspaceEdit,
    }),
    [documentSyncController, service],
  )

  return (
    <WorkspaceEditServiceContext value={service}>
      <WorkspaceEditHostContext value={host}>{children}</WorkspaceEditHostContext>
    </WorkspaceEditServiceContext>
  )
}

class WorkspaceRootGeneration {
  private value = 1

  current(): number {
    return this.value
  }

  advance(): void {
    this.value += 1
  }
}

function workspaceEditUriPath(documentPath: string): string {
  const normalized = documentPath.replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '')
  return normalized ? `/${normalized}` : '/'
}
