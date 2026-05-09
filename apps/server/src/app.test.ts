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
})

function testApp(
  root: string,
  options: {
    homeDirectory?: string
    maxTextFileBytes?: number
    sessionToken?: string
    treeConcurrency?: number
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
    workspaceRoot: root,
  })
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "platform-fs-rpc-"))
  roots.push(root)
  return root
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
