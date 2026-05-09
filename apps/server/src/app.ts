import { cors } from "@elysiajs/cors"
import { Elysia, sse } from "elysia"
import {
  copyBodySchema,
  createFileBodySchema,
  createFolderBodySchema,
  deleteBodySchema,
  eventsQuerySchema,
  findQuerySchema,
  pathQuerySchema,
  recordRecentBodySchema,
  recentsQuerySchema,
  renameBodySchema,
  treeQuerySchema,
  writeBodySchema,
  type WatchServerMessage,
} from "./fs/contracts"
import {
  gitApplyPatchBodySchema,
  gitBlobDiffQuerySchema,
  gitCheckoutBodySchema,
  gitCommitBodySchema,
  gitCreateBranchBodySchema,
  gitDiffQuerySchema,
  gitFileQuerySchema,
  gitPathBodySchema,
  gitPathQuerySchema,
  gitPathsBodySchema,
} from "./git/contracts"
import {
  authGuard,
  createAuthConfig,
  isCorsOriginAllowed,
  type AuthOptions,
} from "./auth"
import { errorPayload, FsError, isFsError } from "./fs/errors"
import { FileSystemService, type FileSystemServiceOptions } from "./fs/service"
import type { FindStreamEvent } from "./fs/search"
import { parseWatchInputs } from "./fs/watch"
import { GitService } from "./git/service"
import { typeScriptLspRoutes } from "./lsp/typescript/routes"

export type AppOptions = FileSystemServiceOptions & {
  auth?: AuthOptions
}

export function createApp(options: AppOptions) {
  const fs = new FileSystemService(options)
  const git = new GitService(fs.paths)
  const auth = createAuthConfig(options.auth)

  return new Elysia({ name: "fs-rpc" })
    .use(
      cors({
        allowedHeaders: ["authorization", "content-type"],
        exposeHeaders: [
          "content-length",
          "content-type",
          "x-fs-mtime-ms",
          "x-fs-path",
        ],
        methods: ["GET", "POST", "OPTIONS"],
        origin: (request) =>
          isCorsOriginAllowed(auth, request.headers.get("origin")),
      })
    )
    .onError(({ code, error, set }) => {
      if (isFsError(error)) {
        set.status = error.statusCode
        return errorPayload(error)
      }

      if (code === "VALIDATION") {
        set.status = 400
        return errorPayload(new FsError("INVALID_PATH", error.message))
      }

      set.status = 500
      return errorPayload(new FsError("OPERATION_FAILED", undefined, error))
    })
    .onBeforeHandle(authGuard(auth))
    .get("/health", () => ({
      ok: true,
      authMode: auth.mode,
      ...fs.info(),
    }))
    .ws("/lsp/typescript", typeScriptLspRoutes(fs, auth))
    .group("/git", (app) =>
      app
        .get("/repo", ({ query }) => git.repo(query.path), {
          query: gitPathQuerySchema,
        })
        .get("/status", ({ query }) => git.status(query.path), {
          query: gitPathQuerySchema,
        })
        .get("/diff/blob", ({ query }) => git.diffBlob(query), {
          query: gitBlobDiffQuerySchema,
        })
        .get("/diff", ({ query }) => git.diff(query.path, query.staged), {
          query: gitDiffQuerySchema,
        })
        .get("/file", ({ query }) => git.file(query.path, query.ref), {
          query: gitFileQuerySchema,
        })
        .get("/branches", ({ query }) => git.branches(query.path), {
          query: gitPathQuerySchema,
        })
        .post("/stage", ({ body }) => git.stage(body), {
          body: gitPathsBodySchema,
        })
        .post("/unstage", ({ body }) => git.unstage(body), {
          body: gitPathsBodySchema,
        })
        .post("/discard", ({ body }) => git.discard(body), {
          body: gitPathsBodySchema,
        })
        .post("/apply-patch", ({ body }) => git.applyPatch(body), {
          body: gitApplyPatchBodySchema,
        })
        .post("/commit", ({ body }) => git.commit(body), {
          body: gitCommitBodySchema,
        })
        .post("/checkout", ({ body }) => git.checkout(body), {
          body: gitCheckoutBodySchema,
        })
        .post("/create-branch", ({ body }) => git.createBranch(body), {
          body: gitCreateBranchBodySchema,
        })
        .post("/fetch", ({ body }) => git.fetch(body.path), {
          body: gitPathBodySchema,
        })
        .post("/pull", ({ body }) => git.pull(body.path), {
          body: gitPathBodySchema,
        })
        .post("/push", ({ body }) => git.push(body.path), {
          body: gitPathBodySchema,
        })
    )
    .group("/fs", (app) =>
      app
        .get("/stat", ({ query }) => fs.stat(query.path), {
          query: pathQuerySchema,
        })
        .get(
          "/tree",
          ({ query }) => fs.tree(query.path, query.depth, query.entryType),
          {
            query: treeQuerySchema,
          }
        )
        .get("/read", ({ query }) => fs.read(query.path), {
          query: pathQuerySchema,
        })
        .get(
          "/blob",
          async ({ query }) => fileResponse(await fs.blob(query.path)),
          {
            query: pathQuerySchema,
          }
        )
        .get(
          "/find/events",
          ({ query, request }) =>
            toFindSse(fs.findEvents(query, request.signal)),
          {
            query: findQuerySchema,
          }
        )
        .get("/find", ({ query }) => fs.find(query), {
          query: findQuerySchema,
        })
        .get("/search", ({ query }) => fs.find(query), {
          query: findQuerySchema,
        })
        .get(
          "/events",
          ({ query, request }) =>
            toSse(
              fs.events(
                parseWatchInputs(query.path, query.paths),
                request.signal
              )
            ),
          {
            query: eventsQuerySchema,
          }
        )
        .get("/recents", ({ query }) => fs.recents(query.limit), {
          query: recentsQuerySchema,
        })
        .post("/recents", ({ body }) => fs.recordRecent(body.path), {
          body: recordRecentBodySchema,
        })
        .post("/write", ({ body }) => fs.write(body), {
          body: writeBodySchema,
        })
        .post("/create-file", ({ body }) => fs.createFile(body), {
          body: createFileBodySchema,
        })
        .post("/create-folder", ({ body }) => fs.createFolder(body), {
          body: createFolderBodySchema,
        })
        .post("/rename", ({ body }) => fs.rename(body), {
          body: renameBodySchema,
        })
        .post("/move", ({ body }) => fs.rename(body), {
          body: renameBodySchema,
        })
        .post("/copy", ({ body }) => fs.copy(body), {
          body: copyBodySchema,
        })
        .post("/delete", ({ body }) => fs.delete(body), {
          body: deleteBodySchema,
        })
    )
    .onStop(() => {
      fs.close()
    })
}

export type App = ReturnType<typeof createApp>

type BlobFile = Awaited<ReturnType<FileSystemService["blob"]>>

async function fileResponse(result: BlobFile) {
  const file = Bun.file(result.absolutePath)
  const headers = new Headers({
    "content-length": String(result.size),
    "x-fs-path": result.path,
    "x-fs-mtime-ms": String(result.mtimeMs),
  })

  headers.set("content-type", file.type || "application/octet-stream")
  return new Response(file, { headers })
}

async function* toSse(events: AsyncGenerator<WatchServerMessage>) {
  for await (const event of events) {
    yield sse({
      event: event.type,
      data: event,
    })
  }
}

async function* toFindSse(events: AsyncGenerator<FindStreamEvent>) {
  try {
    for await (const event of events) {
      yield sse({
        event: event.type,
        data: findEventData(event),
      })
    }
  } catch (error) {
    const fsError = isFsError(error)
      ? error
      : new FsError("OPERATION_FAILED", undefined, error)
    yield sse({
      event: "error",
      data: errorPayload(fsError),
    })
  }
}

function findEventData(event: FindStreamEvent) {
  if (event.type === "match") return { match: event.match }

  return {
    query: event.query,
    path: event.path,
    count: event.count,
    truncated: event.truncated,
  }
}
