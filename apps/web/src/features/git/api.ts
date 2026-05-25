import { rpcErrorMessage } from '@/lib/file-server'
import { client } from '@/lib/client'
import { observeClientOperation } from '@/lib/client-logging'
import type { BranchesResult, BlobDiffRequest, CommitResult, FileDiff, StatusResult } from './types'

export async function fetchStatus(path: string, signal?: AbortSignal) {
  return observeGitOperation(
    { action: 'git.status', path },
    async () => {
      const response = await client.git.status.get({
        query: { path },
        fetch: { signal },
      })

      return unwrapGitResponse<StatusResult>(response)
    },
    (result) => ({ fileCount: result.files.length, hasRepository: result.repository !== null }),
  )
}

export async function fetchDiff(path: string, staged: boolean, signal?: AbortSignal) {
  return observeGitOperation(
    { action: 'git.diff', path, staged },
    async () => {
      const response = await client.git.diff.get({
        query: { path, staged },
        fetch: { signal },
      })

      return unwrapGitResponse<FileDiff[]>(response)
    },
    (diffs) => ({ diffCount: diffs.length }),
  )
}

export async function fetchBlobDiff(query: BlobDiffRequest, signal?: AbortSignal) {
  return observeGitOperation(
    {
      action: 'git.diff_blob',
      hasNewObjectId: Boolean(query.newObjectId),
      hasOldObjectId: Boolean(query.oldObjectId),
      path: query.path,
    },
    async () => {
      const response = await client.git.diff.blob.get({
        query,
        fetch: { signal },
      })

      return unwrapGitResponse<FileDiff[]>(response)
    },
    (diffs) => ({ diffCount: diffs.length }),
  )
}

export async function fetchBranches(path: string, signal?: AbortSignal) {
  return observeGitOperation(
    { action: 'git.branches', path },
    async () => {
      const response = await client.git.branches.get({
        query: { path },
        fetch: { signal },
      })

      return unwrapGitResponse<BranchesResult>(response)
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
    const response = await client.git.stage.post({ paths: Array.from(paths) })

    return unwrapGitResponse<StatusResult>(response)
  })
}

export async function unstagePath(path: string) {
  return unstagePaths([path])
}

export async function unstagePaths(paths: readonly string[]) {
  return observeGitPathsOperation('git.unstage', paths, async () => {
    const response = await client.git.unstage.post({ paths: Array.from(paths) })

    return unwrapGitResponse<StatusResult>(response)
  })
}

export async function discardPath(path: string) {
  return discardPaths([path])
}

export async function discardPaths(paths: readonly string[]) {
  return observeGitPathsOperation('git.discard', paths, async () => {
    const response = await client.git.discard.post({ paths: Array.from(paths) })

    return unwrapGitResponse<StatusResult>(response)
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
      const response = await client.git.commit.post({ message, path })

      return unwrapGitResponse<CommitResult>(response)
    },
    (result) => ({ kind: result.kind }),
  )
}

export async function checkoutBranch(path: string, branch: string) {
  return observeGitOperation(
    { action: 'git.checkout', branch, path },
    async () => {
      const response = await client.git.checkout.post({ branch, path })

      return unwrapGitResponse<StatusResult>(response)
    },
    statusSummary,
  )
}

export async function createBranch(path: string, branch: string) {
  return observeGitOperation(
    { action: 'git.create_branch', branch, checkout: true, path },
    async () => {
      const response = await client.git['create-branch'].post({
        branch,
        checkout: true,
        path,
      })

      return unwrapGitResponse<BranchesResult>(response)
    },
    (result) => ({ branchCount: result.branches.length }),
  )
}

export async function fetchRemote(path: string) {
  return observeGitOperation(
    { action: 'git.fetch_remote', path },
    async () => {
      const response = await client.git.fetch.post({ path })

      return unwrapGitResponse<{ output: string }>(response)
    },
    outputSummary,
  )
}

export async function pullRemote(path: string) {
  return observeGitOperation(
    { action: 'git.pull_remote', path },
    async () => {
      const response = await client.git.pull.post({ path })

      return unwrapGitResponse<{ output: string }>(response)
    },
    outputSummary,
  )
}

export async function pushRemote(path: string) {
  return observeGitOperation(
    { action: 'git.push_remote', path },
    async () => {
      const response = await client.git.push.post({ path })

      return unwrapGitResponse<{ output: string }>(response)
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

function unwrapGitResponse<T>(response: { data?: unknown; error?: unknown }): T {
  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return response.data as T
}

function observeGitOperation<T>(
  event: { readonly action: string; readonly [key: string]: unknown },
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
