import { emptyAddress, formatAddress, parseAddress } from '@workspace/client-core/address/grammar'
import { decodePath, encodePath } from '@workspace/client-core/address/path-token'
import {
  NO_WORKSPACE_SLUG,
  resolveWorkspaceSlug,
  workspaceSlug,
} from '@workspace/client-core/address/slug'
import { toWorkspaceRelative } from '@workspace/client-core/files/path'
import { readRecentEntries, readServerPaths } from '@workspace/client-core/files/read'
import type { Client } from '@workspace/client-core/transport/client'
import type { EnvironmentId } from '@workspace/contracts'

export function settingsAddress(environmentId: EnvironmentId, query = '') {
  return formatAddress({
    ...emptyAddress(),
    environmentId,
    workspace: NO_WORKSPACE_SLUG,
    mode: 'workbench',
    settings: query,
  })
}

export function fileAddress(environmentId: EnvironmentId, path: string, defaultPath: string) {
  const preferred = toWorkspaceRelative(defaultPath, path)
  const root = preferred === null ? '' : defaultPath
  const relative = preferred ?? toWorkspaceRelative(root, path)
  if (relative === null) return null
  return formatAddress({
    ...emptyAddress(),
    environmentId,
    mode: 'workbench',
    side: 'files',
    workspace: workspaceSlug(root, [defaultPath, '']),
    document: relative === '.' ? null : `f/${encodePath(relative)}`,
  })
}

export async function resolveAddress(
  input: string,
  client: Client,
  environmentId: EnvironmentId,
  signal: AbortSignal,
) {
  const address = parseAddress(input, {
    knownEnvironmentIds: [environmentId],
    primaryEnvironmentId: environmentId,
  })
  if (address.rejectedEnvironment !== null)
    return {
      kind: 'failed',
      message: 'This address belongs to a different or unknown environment.',
    } as const
  if (address.settings !== null) return { kind: 'settings', query: address.settings } as const
  const directoryRoot =
    address.mode === 'workbench' && address.side === 'files' && address.document === null
  if (!address.workspace || (!address.document?.startsWith('f/') && !directoryRoot)) {
    return {
      kind: 'failed',
      message:
        'Open a settings or file address. Other screen types are not available in the foundation yet.',
    } as const
  }
  const [paths, recent] = await Promise.all([
    readServerPaths({ client, signal }),
    readRecentEntries({ client, signal }),
  ])
  const root = resolveWorkspaceSlug(address.workspace, {
    indexed: [paths.defaultPath, ''],
    recent: recent.map((entry) => entry.path),
  })
  if (root.kind !== 'resolved')
    return {
      kind: 'failed',
      message: 'The workspace in this address is unknown or ambiguous on this server.',
    } as const
  const path = directoryRoot
    ? root.rootPath
    : decodePath(root.rootPath, address.document!.split('/').slice(1))
  if (path === null)
    return { kind: 'failed', message: 'The file address contains an invalid path.' } as const
  return { kind: 'file', path } as const
}
