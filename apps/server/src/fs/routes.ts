import { Elysia } from 'elysia'
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
} from './contracts'
import { errorPayload, FsError, isFsError } from './errors'
import type { FindStreamEvent } from './search'
import type { FileSystemService } from './service'
import { parseWatchInputs } from './watch'
import { toErrorYieldingSse, toSse } from '../sse'

export function fsRoutes(fs: FileSystemService) {
  return new Elysia({ name: 'fs-routes' }).group('/fs', (app) =>
    app
      .get('/stat', ({ query }) => fs.stat(query.path), {
        query: pathQuerySchema,
      })
      .get('/tree', ({ query }) => fs.tree(query.path, query.depth, query.entryType), {
        query: treeQuerySchema,
      })
      .get('/read', ({ query }) => fs.read(query.path), {
        query: pathQuerySchema,
      })
      .get('/blob', async ({ query }) => fileResponse(await fs.blob(query.path)), {
        query: pathQuerySchema,
      })
      .get(
        '/find/events',
        ({ query, request }) =>
          toErrorYieldingSse(fs.findEvents(query, request.signal), {
            data: findEventData,
            errorData: findErrorData,
            event: (event) => event.type,
          }),
        {
          query: findQuerySchema,
        },
      )
      .get('/find', ({ query }) => fs.find(query), {
        query: findQuerySchema,
      })
      .get('/search', ({ query }) => fs.find(query), {
        query: findQuerySchema,
      })
      .get(
        '/events',
        ({ query, request }) =>
          toSse(fs.events(parseWatchInputs(query.path, query.paths), request.signal), {
            event: (event) => event.type,
          }),
        {
          query: eventsQuerySchema,
        },
      )
      .get('/recents', ({ query }) => fs.recents(query.limit), {
        query: recentsQuerySchema,
      })
      .post('/recents', ({ body }) => fs.recordRecent(body.path), {
        body: recordRecentBodySchema,
      })
      .post('/write', ({ body }) => fs.write(body), {
        body: writeBodySchema,
      })
      .post('/create-file', ({ body }) => fs.createFile(body), {
        body: createFileBodySchema,
      })
      .post('/create-folder', ({ body }) => fs.createFolder(body), {
        body: createFolderBodySchema,
      })
      .post('/rename', ({ body }) => fs.rename(body), {
        body: renameBodySchema,
      })
      .post('/move', ({ body }) => fs.rename(body), {
        body: renameBodySchema,
      })
      .post('/copy', ({ body }) => fs.copy(body), {
        body: copyBodySchema,
      })
      .post('/delete', ({ body }) => fs.delete(body), {
        body: deleteBodySchema,
      }),
  )
}

type BlobFile = Awaited<ReturnType<FileSystemService['blob']>>

async function fileResponse(result: BlobFile) {
  const file = Bun.file(result.absolutePath)
  const headers = new Headers({
    'content-length': String(result.size),
    'x-fs-path': result.path,
    'x-fs-mtime-ms': String(result.mtimeMs),
    'x-fs-version': result.version,
  })

  headers.set('content-type', file.type || 'application/octet-stream')
  return new Response(file, { headers })
}

function findEventData(event: FindStreamEvent) {
  if (event.type === 'match') return { match: event.match }

  return {
    query: event.query,
    path: event.path,
    count: event.count,
    truncated: event.truncated,
  }
}

function findErrorData(error: unknown) {
  const fsError = isFsError(error) ? error : new FsError('OPERATION_FAILED', undefined, error)

  return errorPayload(fsError)
}
