import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { authGuard, createAuthConfig, isCorsOriginAllowed, type AuthOptions } from './auth'
import { db as platformDb } from './db/client'
import { errorPayload, FsError, isFsError } from './fs/errors'
import { fsRoutes } from './fs/routes'
import { FileSystemService, type FileSystemServiceOptions } from './fs/service'
import { gitRoutes } from './git/routes'
import { GitService } from './git/service'
import { lspMatchQuerySchema, lspRouteMatch, lspRoutes } from './lsp/routes'
import {
  applyObservability,
  flushObservability,
  observabilityRoutes,
  recordRequestError,
  recordRequestContext,
} from './observability'
import { OrchestrationEngine } from './orchestration/engine'
import type { OrchestrationDatabase } from './orchestration/event-store'
import { orchestrationRoutes } from './orchestration/routes'
import { TerminalService, type TerminalPtyFactory } from './terminal/service'

export type AppOptions = FileSystemServiceOptions & {
  auth?: AuthOptions
  terminal?: {
    env?: NodeJS.ProcessEnv
    ptyFactory?: TerminalPtyFactory
  }
  orchestration?: {
    database?: OrchestrationDatabase
  }
}

export function createApp(options: AppOptions) {
  const fs = new FileSystemService(options)
  const git = new GitService(fs.paths, {
    maxTextFileBytes: fs.info().maxTextFileBytes,
  })
  const terminal = new TerminalService(Object.assign({ paths: fs.paths }, options.terminal))
  const orchestration = new OrchestrationEngine(options.orchestration?.database ?? platformDb)
  const auth = createAuthConfig(options.auth)

  const app = new Elysia({ name: 'platform' })
  applyObservability(app)

  return app
    .use(
      cors({
        allowedHeaders: ['authorization', 'content-type'],
        exposeHeaders: ['content-length', 'content-type', 'x-fs-mtime-ms', 'x-fs-path'],
        methods: ['GET', 'POST', 'OPTIONS'],
        origin: (request) => isCorsOriginAllowed(auth, request.headers.get('origin')),
      }),
    )
    .onError(({ code, error, set }) => appErrorPayload(code, error, set))
    .onBeforeHandle(authGuard(auth))
    .use(observabilityRoutes())
    .get('/health', () => ({
      ok: true,
      authMode: auth.mode,
      ...fs.info(),
    }))
    .get('/lsp/match', ({ query }) => lspRouteMatch(fs.paths, query), {
      query: lspMatchQuerySchema,
    })
    .ws('/lsp', lspRoutes(fs, auth))
    .ws('/terminal', terminal.routes(auth))
    .use(orchestrationRoutes(orchestration))
    .use(gitRoutes(git))
    .use(fsRoutes(fs))
    .onStop(async () => {
      terminal.dispose()
      await fs.close()
      await flushObservability()
    })
}

export type App = ReturnType<typeof createApp>

function appErrorPayload(
  code: unknown,
  error: unknown,
  set: {
    status?: number | string
  },
) {
  const fsError = errorForResponse(code, error)
  set.status = fsError.statusCode
  recordRequestContext({
    errorCode: fsError.code,
    status: fsError.statusCode,
  })
  recordRequestError(fsError, {
    area: 'server',
    operation: 'request_error',
    status: fsError.statusCode,
  })

  return errorPayload(fsError)
}

function errorForResponse(code: unknown, error: unknown) {
  if (isFsError(error)) return error
  if (code === 'VALIDATION') return new FsError('INVALID_PATH', errorMessage(error))

  return new FsError('OPERATION_FAILED', undefined, error)
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}
