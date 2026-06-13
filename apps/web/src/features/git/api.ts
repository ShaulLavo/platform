import { getClient } from '@/lib/client'
import { observeClientOperation } from '@/lib/client-logging'
import { unwrapEdenResponse } from '@/lib/eden-events'
import type { StatusResult } from './types'

export async function fetchStatus(path: string, signal?: AbortSignal) {
  return observeGitOperation(
    { action: 'git.status', path, signal },
    async () => {
      const response = await getClient().git.status.get({
        query: { path },
        fetch: { signal },
      })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'git server returned an empty response',
      })
    },
    (result) => ({ fileCount: result.files.length, hasRepository: result.repository !== null }),
  )
}

export async function fetchDiff(path: string, staged: boolean, signal?: AbortSignal) {
  return observeGitOperation(
    { action: 'git.diff', path, signal, staged },
    async () => {
      const response = await getClient().git.diff.get({
        query: { path, staged },
        fetch: { signal },
      })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'git server returned an empty response',
      })
    },
    (diffs) => ({ diffCount: diffs.length }),
  )
}

export async function fetchBranches(path: string, signal?: AbortSignal) {
  return observeGitOperation(
    { action: 'git.branches', path, signal },
    async () => {
      const response = await getClient().git.branches.get({
        query: { path },
        fetch: { signal },
      })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'git server returned an empty response',
      })
    },
    (result) => ({
      branchCount: result.branches.length,
      hasRepository: result.repository !== null,
    }),
  )
}

export async function stagePath(path: string) {
  return stagePaths([path])
}

export async function stagePaths(paths: readonly string[]) {
  return observeGitPathsOperation('git.stage', paths, async () => {
    const response = await getClient().git.stage.post({ paths: Array.from(paths) })

    return unwrapEdenResponse(response, {
      requireData: true,
      emptyMessage: 'git server returned an empty response',
    })
  })
}

export async function unstagePath(path: string) {
  return unstagePaths([path])
}

export async function unstagePaths(paths: readonly string[]) {
  return observeGitPathsOperation('git.unstage', paths, async () => {
    const response = await getClient().git.unstage.post({ paths: Array.from(paths) })

    return unwrapEdenResponse(response, {
      requireData: true,
      emptyMessage: 'git server returned an empty response',
    })
  })
}

export async function discardPath(path: string) {
  return discardPaths([path])
}

export async function discardPaths(paths: readonly string[]) {
  return observeGitPathsOperation('git.discard', paths, async () => {
    const response = await getClient().git.discard.post({ paths: Array.from(paths) })

    return unwrapEdenResponse(response, {
      requireData: true,
      emptyMessage: 'git server returned an empty response',
    })
  })
}

export async function commitChanges(path: string, message: string) {
  return observeGitOperation(
    {
      action: 'git.commit',
      messageBytes: new Blob([message]).size,
      path,
    },
    async () => {
      const response = await getClient().git.commit.post({ message, path })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'git server returned an empty response',
      })
    },
    (result) => ({ kind: result.kind }),
  )
}

export async function fetchRemote(path: string) {
  return observeGitOperation(
    { action: 'git.fetch_remote', path },
    async () => {
      const response = await getClient().git.fetch.post({ path })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'git server returned an empty response',
      })
    },
    outputSummary,
  )
}

export async function pullRemote(path: string) {
  return observeGitOperation(
    { action: 'git.pull_remote', path },
    async () => {
      const response = await getClient().git.pull.post({ path })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'git server returned an empty response',
      })
    },
    outputSummary,
  )
}

export async function pushRemote(path: string) {
  return observeGitOperation(
    { action: 'git.push_remote', path },
    async () => {
      const response = await getClient().git.push.post({ path })

      return unwrapEdenResponse(response, {
        requireData: true,
        emptyMessage: 'git server returned an empty response',
      })
    },
    outputSummary,
  )
}

export async function syncRemote(path: string) {
  return observeGitOperation({ action: 'git.sync_remote', path }, async () => {
    const pull = await pullRemote(path)
    const push = await pushRemote(path)

    return { pull, push }
  })
}

function observeGitOperation<T>(
  event: {
    readonly action: string
    readonly signal?: AbortSignal
    readonly [key: string]: unknown
  },
  operation: () => Promise<T>,
  summarize?: (result: T) => Record<string, unknown>,
) {
  return observeClientOperation({ area: 'git', ...event }, operation, summarize)
}

function observeGitPathsOperation(
  action: string,
  paths: readonly string[],
  operation: () => Promise<StatusResult>,
) {
  return observeGitOperation(
    {
      action,
      path: paths[0] ?? '',
      pathCount: paths.length,
    },
    operation,
    statusSummary,
  )
}

function statusSummary(result: StatusResult) {
  return {
    fileCount: result.files.length,
    hasRepository: result.repository !== null,
  }
}

function outputSummary(result: { output: string }) {
  return {
    outputBytes: new Blob([result.output]).size,
  }
}
