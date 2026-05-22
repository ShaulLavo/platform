import { beforeEach, describe, expect, it, mock } from "bun:test"

const statusGet = mock()
const diffGet = mock()
const blobDiffGet = mock()
const branchesGet = mock()
const stagePost = mock()
const unstagePost = mock()
const discardPost = mock()
const commitPost = mock()
const checkoutPost = mock()
const createBranchPost = mock()
const fetchPost = mock()
const pullPost = mock()
const pushPost = mock()

mock.module("@/lib/fs-client", () => ({
  fsClient: {
    git: {
      status: { get: statusGet },
      diff: { get: diffGet, blob: { get: blobDiffGet } },
      branches: { get: branchesGet },
      stage: { post: stagePost },
      unstage: { post: unstagePost },
      discard: { post: discardPost },
      commit: { post: commitPost },
      checkout: { post: checkoutPost },
      "create-branch": { post: createBranchPost },
      fetch: { post: fetchPost },
      pull: { post: pullPost },
      push: { post: pushPost },
    },
  },
}))

const api = await import("./api")

describe("git api", () => {
  beforeEach(() => {
    for (const endpoint of [
      statusGet,
      diffGet,
      blobDiffGet,
      branchesGet,
      stagePost,
      unstagePost,
      discardPost,
      commitPost,
      checkoutPost,
      createBranchPost,
      fetchPost,
      pullPost,
      pushPost,
    ]) {
      endpoint.mockReset()
    }
  })

  it("passes read query params and abort signals through to the RPC client", async () => {
    const signal = new AbortController().signal
    const status = { files: [], repository: repositoryInfo() }
    statusGet.mockResolvedValueOnce({ data: status })

    await expect(api.fetchStatus("repo", signal)).resolves.toBe(status)

    expect(statusGet).toHaveBeenCalledWith({
      query: { path: "repo" },
      fetch: { signal },
    })
  })

  it("uses the server bulk path body for path mutations", async () => {
    const status = { files: [], repository: repositoryInfo() }
    stagePost.mockResolvedValueOnce({ data: status })
    unstagePost.mockResolvedValueOnce({ data: status })
    discardPost.mockResolvedValueOnce({ data: status })

    await expect(api.stagePath("src/a.ts")).resolves.toBe(status)
    await expect(api.unstagePaths(["src/a.ts", "src/b.ts"])).resolves.toBe(
      status
    )
    await expect(api.discardPath("src/c.ts")).resolves.toBe(status)

    expect(stagePost).toHaveBeenCalledWith({ paths: ["src/a.ts"] })
    expect(unstagePost).toHaveBeenCalledWith({
      paths: ["src/a.ts", "src/b.ts"],
    })
    expect(discardPost).toHaveBeenCalledWith({ paths: ["src/c.ts"] })
  })

  it("maps RPC error payloads to user-safe errors", async () => {
    statusGet.mockResolvedValueOnce({
      error: { value: { error: { code: "GIT_REPOSITORY_NOT_FOUND" } } },
    })

    await expect(api.fetchStatus("repo")).rejects.toThrow(
      "The file server could not complete the filesystem operation."
    )
  })

  it("keeps branch and remote mutation payloads explicit", async () => {
    const branches = { branches: [], repository: repositoryInfo() }
    const output = { output: "done" }
    createBranchPost.mockResolvedValueOnce({ data: branches })
    fetchPost.mockResolvedValueOnce({ data: output })

    await expect(api.createBranch("repo", "feature")).resolves.toBe(branches)
    await expect(api.fetchRemote("repo")).resolves.toBe(output)

    expect(createBranchPost).toHaveBeenCalledWith({
      branch: "feature",
      checkout: true,
      path: "repo",
    })
    expect(fetchPost).toHaveBeenCalledWith({ path: "repo" })
  })

  it("syncs remote changes by pulling before pushing", async () => {
    const calls: string[] = []
    const pull = { output: "pulled" }
    const push = { output: "pushed" }
    pullPost.mockImplementationOnce(async () => {
      calls.push("pull")
      return { data: pull }
    })
    pushPost.mockImplementationOnce(async () => {
      calls.push("push")
      return { data: push }
    })

    await expect(api.syncRemote("repo")).resolves.toEqual({ pull, push })

    expect(pullPost).toHaveBeenCalledWith({ path: "repo" })
    expect(pushPost).toHaveBeenCalledWith({ path: "repo" })
    expect(calls).toEqual(["pull", "push"])
  })
})

function repositoryInfo() {
  return {
    ahead: 0,
    behind: 0,
    branch: "main",
    commit: "abc123",
    path: "repo",
  }
}
