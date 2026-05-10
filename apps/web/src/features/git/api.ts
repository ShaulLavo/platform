import { rpcErrorMessage } from "@/lib/file-server"
import { fsClient } from "@/lib/fs-client"
import type {
  BranchesResult,
  BlobDiffRequest,
  CommitResult,
  FileDiff,
  StatusResult,
} from "./types"

export async function fetchStatus(path: string, signal?: AbortSignal) {
  const response = await fsClient.git.status.get({
    query: { path },
    fetch: { signal },
  })

  return unwrapGitResponse<StatusResult>(response)
}

export async function fetchDiff(
  path: string,
  staged: boolean,
  signal?: AbortSignal
) {
  const response = await fsClient.git.diff.get({
    query: { path, staged },
    fetch: { signal },
  })

  return unwrapGitResponse<FileDiff[]>(response)
}

export async function fetchBlobDiff(
  query: BlobDiffRequest,
  signal?: AbortSignal
) {
  const response = await fsClient.git.diff.blob.get({
    query,
    fetch: { signal },
  })

  return unwrapGitResponse<FileDiff[]>(response)
}

export async function fetchBranches(path: string, signal?: AbortSignal) {
  const response = await fsClient.git.branches.get({
    query: { path },
    fetch: { signal },
  })

  return unwrapGitResponse<BranchesResult>(response)
}

export async function stagePath(path: string) {
  const response = await fsClient.git.stage.post({ paths: [path] })

  return unwrapGitResponse<StatusResult>(response)
}

export async function stagePaths(paths: readonly string[]) {
  const response = await fsClient.git.stage.post({ paths: [...paths] })

  return unwrapGitResponse<StatusResult>(response)
}

export async function unstagePath(path: string) {
  const response = await fsClient.git.unstage.post({ paths: [path] })

  return unwrapGitResponse<StatusResult>(response)
}

export async function unstagePaths(paths: readonly string[]) {
  const response = await fsClient.git.unstage.post({ paths: [...paths] })

  return unwrapGitResponse<StatusResult>(response)
}

export async function discardPath(path: string) {
  const response = await fsClient.git.discard.post({ paths: [path] })

  return unwrapGitResponse<StatusResult>(response)
}

export async function discardPaths(paths: readonly string[]) {
  const response = await fsClient.git.discard.post({ paths: [...paths] })

  return unwrapGitResponse<StatusResult>(response)
}

export async function commitChanges(path: string, message: string) {
  const response = await fsClient.git.commit.post({ message, path })

  return unwrapGitResponse<CommitResult>(response)
}

export async function checkoutBranch(path: string, branch: string) {
  const response = await fsClient.git.checkout.post({ branch, path })

  return unwrapGitResponse<StatusResult>(response)
}

export async function createBranch(path: string, branch: string) {
  const response = await fsClient.git["create-branch"].post({
    branch,
    checkout: true,
    path,
  })

  return unwrapGitResponse<BranchesResult>(response)
}

export async function fetchRemote(path: string) {
  const response = await fsClient.git.fetch.post({ path })

  return unwrapGitResponse<{ output: string }>(response)
}

export async function pullRemote(path: string) {
  const response = await fsClient.git.pull.post({ path })

  return unwrapGitResponse<{ output: string }>(response)
}

export async function pushRemote(path: string) {
  const response = await fsClient.git.push.post({ path })

  return unwrapGitResponse<{ output: string }>(response)
}

function unwrapGitResponse<T>(response: {
  data?: unknown
  error?: unknown
}): T {
  if (response.error) throw new Error(rpcErrorMessage(response.error))

  return response.data as T
}
