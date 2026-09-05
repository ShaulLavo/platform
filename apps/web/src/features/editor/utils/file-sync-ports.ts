import type { FileSyncPorts } from '@/features/editor/state/file-sync-service'
import type { Client } from '@/lib/client'
import {
  fetchFile,
  fetchWorkspaceEditRecovery,
  fetchWorkspaceEditStatus,
  prepareWorkspaceEditMutation,
  recoverWorkspaceEditMutation,
  releaseWorkspaceEditMutation,
  statPath,
  transitionWorkspaceEditMutation,
  writeFileContent,
} from '@/lib/file-server'

export function createFileSyncPorts(client: Client): FileSyncPorts {
  return {
    inspectPath: (path, signal) => statPath(path, signal, client),
    readFileContent: (path, signal) => fetchFile(path, signal, client),
    writeFileContent: (path, content, options) => writeFileContent(path, content, options, client),
    workspaceMutations: {
      prepare: (request, signal) => prepareWorkspaceEditMutation(request, signal, client),
      transition: (transition, request, signal) =>
        transitionWorkspaceEditMutation(transition, request, signal, client),
      recover: (request, signal) => recoverWorkspaceEditMutation(request, signal, client),
      release: (request, signal) => releaseWorkspaceEditMutation(request, signal, client),
      status: (operationId, signal) => fetchWorkspaceEditStatus(operationId, signal, client),
      recovery: (workspace, signal) => fetchWorkspaceEditRecovery(workspace, signal, client),
    },
  }
}
