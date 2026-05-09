import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "bun:test"
import { createApp } from "./app"

const TRUSTED_ORIGIN = "http://localhost:5173"
const roots: string[] = []

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("fs rpc auth", () => {
  it("accepts trusted local app origins", async () => {
    const app = testApp(await fixtureRoot())
    const response = await app.handle(
      new Request("http://local/health", {
        headers: { origin: TRUSTED_ORIGIN },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
  })

  it("rejects requests without an origin", async () => {
    const app = testApp(await fixtureRoot())
    const response = await app.handle(new Request("http://local/health"))

    expect(response.status).toBe(401)
    expect(await errorCode(response)).toBe("UNAUTHORIZED")
  })

  it("rejects disallowed origins", async () => {
    const app = testApp(await fixtureRoot())
    const response = await app.handle(
      new Request("http://local/health", {
        headers: { origin: "http://evil.localhost" },
      })
    )

    expect(response.status).toBe(403)
    expect(await errorCode(response)).toBe("FORBIDDEN_ORIGIN")
  })

  it("sets CORS headers for trusted origins", async () => {
    const app = testApp(await fixtureRoot())
    const response = await app.handle(
      new Request("http://local/health", {
        headers: { origin: TRUSTED_ORIGIN },
      })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("access-control-allow-origin")).toBe(
      TRUSTED_ORIGIN
    )
  })

  it("requires the bootstrap session token when configured", async () => {
    const app = testApp(await fixtureRoot(), { sessionToken: "secret" })
    const missing = await app.handle(
      new Request("http://local/health", {
        headers: trustedOriginHeaders(),
      })
    )
    const invalid = await app.handle(
      new Request("http://local/health", {
        headers: trustedOriginHeaders({ authorization: "Bearer wrong" }),
      })
    )
    const valid = await app.handle(
      new Request("http://local/health", {
        headers: trustedOriginHeaders({ authorization: "Bearer secret" }),
      })
    )

    expect(missing.status).toBe(401)
    expect(await errorCode(missing)).toBe("UNAUTHORIZED")
    expect(invalid.status).toBe(401)
    expect(await errorCode(invalid)).toBe("UNAUTHORIZED")
    expect(valid.status).toBe(200)
    expect(await valid.json()).toMatchObject({ authMode: "session-token" })
  })
})

describe("fs rpc filesystem limits", () => {
  it("reports home as the default browsing path while keeping root selectable", async () => {
    const root = await fixtureRoot()
    const home = path.join(root, "home")
    await mkdir(home, { recursive: true })
    const app = testApp(root, { homeDirectory: home })

    const health = await app.handle(
      new Request("http://local/health", {
        headers: trustedOriginHeaders(),
      })
    )
    const tree = await app.handle(
      new Request("http://local/fs/tree?path=&depth=1", {
        headers: trustedOriginHeaders(),
      })
    )

    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({
      defaultPath: "home",
      homePath: "home",
      systemRoot: path.parse(home).root,
      workspaceRoot: root,
    })
    expect(tree.status).toBe(200)
    expect(await tree.json()).toMatchObject({ path: "" })
  })

  it("rejects text reads above the configured cap", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "large.txt"), "")
    await truncate(path.join(root, "large.txt"), 6)
    const app = testApp(root, { maxTextFileBytes: 5 })
    const response = await app.handle(
      new Request("http://local/fs/read?path=large.txt", {
        headers: trustedOriginHeaders(),
      })
    )

    expect(response.status).toBe(413)
    expect(await errorCode(response)).toBe("FILE_TOO_LARGE")
  })

  it("reports symlink directories without recursively traversing them", async () => {
    const root = await fixtureRoot()
    const outside = await fixtureRoot()
    await mkdir(path.join(outside, "target"), { recursive: true })
    await writeFile(path.join(outside, "target", "secret.txt"), "hidden")
    await symlink(path.join(outside, "target"), path.join(root, "linked"))
    const app = testApp(root)

    const response = await app.handle(
      new Request("http://local/fs/tree?path=&depth=2", {
        headers: trustedOriginHeaders(),
      })
    )
    const payload = (await response.json()) as {
      entries: Array<{ children?: unknown; path: string; type: string }>
    }
    const linked = payload.entries.find((entry) => entry.path === "linked")

    expect(response.status).toBe(200)
    expect(linked).toMatchObject({ path: "linked", type: "symlink" })
    expect(linked).not.toHaveProperty("children")
  })

  it("loads large directories through bounded concurrent stat reads", async () => {
    const root = await fixtureRoot()
    await Promise.all(
      Array.from({ length: 96 }, (_, index) =>
        writeFile(path.join(root, `file-${index}.txt`), "ok")
      )
    )
    const app = testApp(root, { treeConcurrency: 4 })

    const response = await app.handle(
      new Request("http://local/fs/tree?path=&depth=1", {
        headers: trustedOriginHeaders(),
      })
    )
    const payload = (await response.json()) as {
      entries: Array<{ path: string }>
    }

    expect(response.status).toBe(200)
    expect(payload.entries).toHaveLength(96)
  })

  it("reports native watcher state", async () => {
    const enabled = testApp(await fixtureRoot())
    const disabled = testApp(await fixtureRoot(), { watch: false })

    const enabledHealth = await enabled.handle(
      new Request("http://local/health", {
        headers: trustedOriginHeaders(),
      })
    )
    const disabledHealth = await disabled.handle(
      new Request("http://local/health", {
        headers: trustedOriginHeaders(),
      })
    )

    expect(await enabledHealth.json()).toMatchObject({
      nativeWatcherCount: 0,
      watchEnabled: true,
    })
    expect(await disabledHealth.json()).toMatchObject({
      nativeWatcherCount: 0,
      watchEnabled: false,
    })
  })
})

describe("fs rpc events", () => {
  it("delivers child path changes to parent path subscriptions", async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, "src"), { recursive: true })
    const app = testApp(root, { watch: false })
    const stream = await app.handle(
      new Request("http://local/fs/events?path=src", {
        headers: trustedOriginHeaders(),
      })
    )
    const events = createSseReader(stream)

    expect(await events.next()).toMatchObject({ type: "ready" })

    const created = app.handle(
      new Request("http://local/fs/create-file", {
        body: JSON.stringify({ path: "src/child.txt", content: "ok" }),
        headers: trustedOriginHeaders({ "content-type": "application/json" }),
        method: "POST",
      })
    )

    expect(await events.next()).toMatchObject({
      path: "src/child.txt",
      type: "created",
    })
    expect((await created).status).toBe(200)
    await events.close()
  })

  it("includes entry metadata on changed events for existing files", async () => {
    const root = await fixtureRoot()
    await writeFile(path.join(root, "file.txt"), "before")
    const app = testApp(root, { watch: false })
    const stream = await app.handle(
      new Request("http://local/fs/events", {
        headers: trustedOriginHeaders(),
      })
    )
    const events = createSseReader(stream)

    expect(await events.next()).toMatchObject({ type: "ready" })

    const changed = app.handle(
      new Request("http://local/fs/write", {
        body: JSON.stringify({ path: "file.txt", content: "after" }),
        headers: trustedOriginHeaders({ "content-type": "application/json" }),
        method: "POST",
      })
    )
    const event = await events.next()

    expect(event).toMatchObject({
      entry: {
        name: "file.txt",
        path: "file.txt",
        size: 5,
        type: "file",
      },
      path: "file.txt",
      type: "changed",
    })
    expect(typeof event.entry).toBe("object")
    expect(typeof (event.entry as Record<string, unknown>).mtimeMs).toBe(
      "number"
    )
    expect((await changed).status).toBe(200)
    await events.close()
  })

  it("does not include entry metadata on deleted events", async () => {
    const root = await fixtureRoot()
    const app = testApp(root, { watch: false })
    const stream = await app.handle(
      new Request("http://local/fs/events", {
        headers: trustedOriginHeaders(),
      })
    )
    const events = createSseReader(stream)

    expect(await events.next()).toMatchObject({ type: "ready" })

    const created = await app.handle(
      new Request("http://local/fs/create-file", {
        body: JSON.stringify({ path: "gone.txt", content: "ok" }),
        headers: trustedOriginHeaders({ "content-type": "application/json" }),
        method: "POST",
      })
    )
    expect(created.status).toBe(200)
    expect(await events.next()).toMatchObject({ type: "created" })

    const deleted = app.handle(
      new Request("http://local/fs/delete", {
        body: JSON.stringify({ path: "gone.txt" }),
        headers: trustedOriginHeaders({ "content-type": "application/json" }),
        method: "POST",
      })
    )
    const event = await events.next()

    expect(event).toMatchObject({
      path: "gone.txt",
      type: "deleted",
    })
    expect(event).not.toHaveProperty("entry")
    expect((await deleted).status).toBe(200)
    await events.close()
  })

  it("filters ignored path changes out of event streams", async () => {
    const root = await fixtureRoot()
    await mkdir(path.join(root, "node_modules"), { recursive: true })
    const app = testApp(root, { watch: false })
    const stream = await app.handle(
      new Request("http://local/fs/events", {
        headers: trustedOriginHeaders(),
      })
    )
    const events = createSseReader(stream)

    expect(await events.next()).toMatchObject({ type: "ready" })

    const created = await app.handle(
      new Request("http://local/fs/create-file", {
        body: JSON.stringify({ path: "node_modules/ignored.txt" }),
        headers: trustedOriginHeaders({ "content-type": "application/json" }),
        method: "POST",
      })
    )

    expect(created.status).toBe(200)
    await expect(noEvent(events)).resolves.toBe(true)
    await events.close()
  })
})

describe("git rpc", () => {
  it("reports status, diffs, and staged files", async () => {
    const root = await fixtureRoot()
    await initGitRepository(root)
    await writeFile(path.join(root, "tracked.txt"), "before\n")
    await runGit(root, ["add", "tracked.txt"])
    await runGit(root, ["commit", "-m", "initial"])
    await writeFile(path.join(root, "tracked.txt"), "after\n")
    await writeFile(path.join(root, "new.txt"), "new\n")
    const app = testApp(root)

    const status = await app.handle(
      new Request("http://local/git/status", {
        headers: trustedOriginHeaders(),
      })
    )
    const diff = await app.handle(
      new Request("http://local/git/diff?path=tracked.txt", {
        headers: trustedOriginHeaders(),
      })
    )
    const untrackedDiff = await app.handle(
      new Request("http://local/git/diff?path=new.txt", {
        headers: trustedOriginHeaders(),
      })
    )
    const staged = await app.handle(
      new Request("http://local/git/stage", {
        body: JSON.stringify({ paths: ["tracked.txt"] }),
        headers: trustedOriginHeaders({ "content-type": "application/json" }),
        method: "POST",
      })
    )

    expect(status.status).toBe(200)
    const statusPayload = (await status.json()) as GitStatusTestPayload
    expect(statusPayload.repository).toMatchObject({ path: "" })
    expect(statusPayload.files).toContainEqual(
      expect.objectContaining({ path: "new.txt", status: "untracked" })
    )
    expect(statusPayload.files).toContainEqual(
      expect.objectContaining({ path: "tracked.txt", status: "modified" })
    )
    expect(diff.status).toBe(200)
    expect(await diff.json()).toMatchObject([
      {
        path: "tracked.txt",
        staged: false,
        hunks: [
          {
            changes: [
              { oldLine: 1, text: "before", type: "deleted" },
              { newLine: 1, text: "after", type: "added" },
            ],
          },
        ],
      },
    ])
    expect(untrackedDiff.status).toBe(200)
    expect(await untrackedDiff.json()).toMatchObject([
      {
        oldFileMissing: true,
        path: "new.txt",
        staged: false,
        hunks: [
          {
            changes: [{ newLine: 1, text: "new", type: "added" }],
          },
        ],
      },
    ])
    expect(staged.status).toBe(200)
    const stagedPayload = (await staged.json()) as GitStatusTestPayload
    expect(stagedPayload.files).toContainEqual(
      expect.objectContaining({ path: "new.txt", status: "untracked" })
    )
    expect(stagedPayload.files).toContainEqual(
      expect.objectContaining({
        index: "modified",
        path: "tracked.txt",
        status: "modified",
        worktree: "unmodified",
      })
    )
  })

  it("renders staged blob snapshots after the index changes", async () => {
    const root = await fixtureRoot()
    await initGitRepository(root)
    await writeFile(path.join(root, "tracked.txt"), "before\n")
    await runGit(root, ["add", "tracked.txt"])
    await runGit(root, ["commit", "-m", "initial"])
    await writeFile(path.join(root, "tracked.txt"), "after\n")
    await runGit(root, ["add", "tracked.txt"])
    const app = testApp(root)

    const live = await app.handle(
      new Request("http://local/git/diff?path=tracked.txt&staged=true", {
        headers: trustedOriginHeaders(),
      })
    )
    expect(live.status).toBe(200)
    const [snapshot] = (await live.json()) as GitDiffTestPayload
    await runGit(root, ["restore", "--staged", "tracked.txt"])

    const stale = await app.handle(
      new Request(`http://local/git/diff/blob?${blobDiffParams(snapshot)}`, {
        headers: trustedOriginHeaders(),
      })
    )

    expect(stale.status).toBe(200)
    expect(await stale.json()).toMatchObject([
      {
        newObjectId: snapshot.newObjectId,
        oldObjectId: snapshot.oldObjectId,
        path: "tracked.txt",
        hunks: [
          {
            changes: [
              { oldLine: 1, text: "before", type: "deleted" },
              { newLine: 1, text: "after", type: "added" },
            ],
          },
        ],
      },
    ])
  })

  it("renders unstaged blob snapshots after the worktree changes again", async () => {
    const root = await fixtureRoot()
    await initGitRepository(root)
    await writeFile(path.join(root, "tracked.txt"), "before\n")
    await runGit(root, ["add", "tracked.txt"])
    await runGit(root, ["commit", "-m", "initial"])
    await writeFile(path.join(root, "tracked.txt"), "after\n")
    const app = testApp(root)

    const live = await app.handle(
      new Request("http://local/git/diff?path=tracked.txt", {
        headers: trustedOriginHeaders(),
      })
    )
    expect(live.status).toBe(200)
    const [snapshot] = (await live.json()) as GitDiffTestPayload
    await writeFile(path.join(root, "tracked.txt"), "later\n")

    const stale = await app.handle(
      new Request(`http://local/git/diff/blob?${blobDiffParams(snapshot)}`, {
        headers: trustedOriginHeaders(),
      })
    )

    expect(stale.status).toBe(200)
    expect(await stale.json()).toMatchObject([
      {
        path: "tracked.txt",
        hunks: [
          {
            changes: [
              { oldLine: 1, text: "before", type: "deleted" },
              { newLine: 1, text: "after", type: "added" },
            ],
          },
        ],
      },
    ])
  })

  it("renders untracked blob snapshots after the file is deleted", async () => {
    const root = await fixtureRoot()
    await initGitRepository(root)
    await writeFile(path.join(root, "new.txt"), "new\n")
    const app = testApp(root)

    const live = await app.handle(
      new Request("http://local/git/diff?path=new.txt", {
        headers: trustedOriginHeaders(),
      })
    )
    expect(live.status).toBe(200)
    const [snapshot] = (await live.json()) as GitDiffTestPayload
    await rm(path.join(root, "new.txt"))

    const stale = await app.handle(
      new Request(`http://local/git/diff/blob?${blobDiffParams(snapshot)}`, {
        headers: trustedOriginHeaders(),
      })
    )

    expect(stale.status).toBe(200)
    expect(await stale.json()).toMatchObject([
      {
        oldFileMissing: true,
        path: "new.txt",
        hunks: [
          {
            changes: [{ newLine: 1, text: "new", type: "added" }],
          },
        ],
      },
    ])
  })

  it("renders deletion and rename blob snapshots with stable paths", async () => {
    const root = await fixtureRoot()
    await initGitRepository(root)
    await writeFile(path.join(root, "old.txt"), "one\ntwo\nthree\nfour\n")
    await writeFile(path.join(root, "deleted.txt"), "gone\n")
    await runGit(root, ["add", "old.txt"])
    await runGit(root, ["add", "deleted.txt"])
    await runGit(root, ["commit", "-m", "initial"])
    await runGit(root, ["mv", "old.txt", "new.txt"])
    await writeFile(path.join(root, "new.txt"), "one\nTWO\nthree\nfour\n")
    await runGit(root, ["add", "new.txt"])
    await rm(path.join(root, "deleted.txt"))
    const app = testApp(root)

    const rename = await app.handle(
      new Request("http://local/git/diff?path=new.txt&staged=true", {
        headers: trustedOriginHeaders(),
      })
    )
    const deletion = await app.handle(
      new Request("http://local/git/diff?path=deleted.txt", {
        headers: trustedOriginHeaders(),
      })
    )
    const [renameSnapshot] = (await rename.json()) as GitDiffTestPayload
    const [deletionSnapshot] = (await deletion.json()) as GitDiffTestPayload

    const staleRename = await app.handle(
      new Request(
        `http://local/git/diff/blob?${blobDiffParams(renameSnapshot)}`,
        { headers: trustedOriginHeaders() }
      )
    )
    const staleDeletion = await app.handle(
      new Request(
        `http://local/git/diff/blob?${blobDiffParams(deletionSnapshot)}`,
        { headers: trustedOriginHeaders() }
      )
    )

    expect(staleRename.status).toBe(200)
    expect(await staleRename.json()).toMatchObject([
      { oldPath: "old.txt", path: "new.txt" },
    ])
    expect(staleDeletion.status).toBe(200)
    expect(await staleDeletion.json()).toMatchObject([
      { newFileMissing: true, path: "deleted.txt" },
    ])
  })
})

type GitStatusTestPayload = {
  repository: { branch: string | null; path: string } | null
  files: Array<Record<string, unknown>>
}

type GitDiffTestPayload = Array<{
  newObjectId?: string
  oldObjectId?: string
  oldPath?: string
  path: string
}>

function blobDiffParams(diff: GitDiffTestPayload[number]) {
  const params = new URLSearchParams({ path: diff.path })
  if (diff.oldPath) params.set("oldPath", diff.oldPath)
  if (diff.oldObjectId) params.set("oldObjectId", diff.oldObjectId)
  if (diff.newObjectId) params.set("newObjectId", diff.newObjectId)

  return params
}

function testApp(
  root: string,
  options: {
    homeDirectory?: string
    maxTextFileBytes?: number
    sessionToken?: string
    treeConcurrency?: number
    watch?: boolean
  } = {}
) {
  return createApp({
    auth: {
      allowedOrigins: [TRUSTED_ORIGIN],
      sessionToken: options.sessionToken,
    },
    homeDirectory: options.homeDirectory,
    maxTextFileBytes: options.maxTextFileBytes,
    treeConcurrency: options.treeConcurrency,
    watch: options.watch,
    workspaceRoot: root,
  })
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "platform-fs-rpc-"))
  roots.push(root)
  return root
}

async function initGitRepository(root: string) {
  await runGit(root, ["init"])
  await runGit(root, ["config", "user.email", "test@example.com"])
  await runGit(root, ["config", "user.name", "Test User"])
}

async function runGit(root: string, args: readonly string[]) {
  const process = Bun.spawn(["git", "-C", root, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (exitCode === 0) return { stderr, stdout }

  throw new Error(`${stderr}${stdout}`.trim())
}

function trustedOriginHeaders(headers: HeadersInit = {}) {
  return {
    ...headers,
    origin: TRUSTED_ORIGIN,
  }
}

async function errorCode(response: Response) {
  const payload = (await response.json()) as { error: { code: string } }
  return payload.error.code
}

function createSseReader(response: Response) {
  if (!response.body) throw new Error("missing event stream body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffered = ""

  return {
    close: () => reader.cancel(),
    next: async () => {
      while (true) {
        const event = shiftSseEvent()
        if (event) return event

        const chunk = await reader.read()
        if (chunk.done) throw new Error("event stream ended")
        buffered += decodeSseChunk(decoder, chunk.value)
      }
    },
  }

  function shiftSseEvent() {
    const separator = buffered.indexOf("\n\n")
    if (separator < 0) return null

    const raw = buffered.slice(0, separator)
    buffered = buffered.slice(separator + 2)
    return parseSsePayload(raw)
  }
}

function decodeSseChunk(decoder: TextDecoder, value: unknown) {
  if (typeof value === "string") return value

  return decoder.decode(value as BufferSource, { stream: true })
}

function parseSsePayload(raw: string) {
  const data = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")

  return JSON.parse(data) as Record<string, unknown>
}

async function noEvent(events: ReturnType<typeof createSseReader>) {
  const result = await Promise.race([
    events.next().then(() => false),
    delay(50).then(() => true),
  ])

  return result
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
