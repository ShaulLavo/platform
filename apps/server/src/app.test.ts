import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises"
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
})

describe("fs rpc filesystem limits", () => {
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
})

function testApp(
  root: string,
  options: { maxTextFileBytes?: number } = {}
) {
  return createApp({
    auth: {
      allowedOrigins: [TRUSTED_ORIGIN],
    },
    maxTextFileBytes: options.maxTextFileBytes,
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
