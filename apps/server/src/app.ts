import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { authGuard, createAuthConfig, isCorsOriginAllowed, type AuthOptions } from './auth'
import { getDefaultPlatformDatabase } from './db/client'
import { fontRoutes } from './fonts/routes'
import { NerdFontService, type FontService } from './fonts/service'
import { errorPayload, FsError, isFsError } from './fs/errors'
import { fsRoutes } from './fs/routes'
import { FileSystemService, type FileSystemServiceOptions } from './fs/service'
import { gitRoutes } from './git/routes'
import { GitService } from './git/service'
import { lspMatchQuerySchema, lspRouteMatch, lspRoutes } from './lsp/routes'
import {
  applyObservability,
  flushObservability,
  isEvlogError,
  observabilityRoutes,
  recordRequestContext,
  recordRequestError,
} from './observability'
import { OrchestrationEngine } from './orchestration/engine'
import { OrchestrationCheckpointDiffQuery } from './orchestration/checkpoint-diff-query'
import type { OrchestrationDatabase } from './orchestration/event-store'
import { orchestrationRoutes } from './orchestration/routes'
import { orchestrationWsRoutes } from './orchestration/ws-rpc'
import {
  createDefaultProviderAdapterRegistry,
  type ProviderAdapterRegistry,
} from './provider/provider-adapter-registry'
import { providerRoutes } from './provider/routes'
import { TerminalService, type TerminalPtyFactory } from './terminal/service'

export type AppOptions = FileSystemServiceOptions & {
  auth?: AuthOptions
  terminal?: {
    env?: NodeJS.ProcessEnv
    ptyFactory?: TerminalPtyFactory
  }
  fonts?: FontService
  orchestration?: {
    database?: OrchestrationDatabase
    providerAdapterRegistry?: ProviderAdapterRegistry
    providerRuntime?: boolean
  }
}

const appCleanups = new WeakMap<object, () => Promise<void>>()

export function createApp(options: AppOptions) {
  const fs = new FileSystemService(options)
  const git = new GitService(fs.paths, {
    maxTextFileBytes: fs.info().maxTextFileBytes,
  })
  const terminal = new TerminalService(Object.assign({ paths: fs.paths }, options.terminal))
  const fonts = options.fonts ?? new NerdFontService()
  const providerAdapterRegistry =
    options.orchestration?.providerAdapterRegistry ?? createDefaultProviderAdapterRegistry()
  const orchestration = new OrchestrationEngine(
    options.orchestration?.database ?? getDefaultPlatformDatabase(),
    {
      providerRuntime: options.orchestration?.providerRuntime
        ? { adapterRegistry: providerAdapterRegistry, checkpointGit: git }
        : false,
    },
  )
  const checkpointDiff = new OrchestrationCheckpointDiffQuery(
    options.orchestration?.database ?? getDefaultPlatformDatabase(),
    git,
  )
  const auth = createAuthConfig(options.auth)
  const cleanup = appCleanup(terminal, fs)

  const app = new Elysia({ name: 'platform' })
  applyObservability(app)

  const configured = app
    .use(
      cors({
        allowedHeaders: ['authorization', 'content-type', 'x-evlog-source'],
        exposeHeaders: [
          'cache-control',
          'content-length',
          'content-type',
          'x-fs-mtime-ms',
          'x-fs-path',
        ],
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
    .use(providerRoutes(providerAdapterRegistry))
    .use(orchestrationWsRoutes(orchestration, auth))
    .use(orchestrationRoutes(orchestration, checkpointDiff))
    .use(fontRoutes(fonts))
    .use(gitRoutes(git))
    .use(fsRoutes(fs))
    .onStop(cleanup)
  appCleanups.set(configured, cleanup)
  return configured
}

export type App = ReturnType<typeof createApp>

export async function closeApp(app: App) {
  await appCleanups.get(app)?.()
}

function appCleanup(terminal: TerminalService, fs: FileSystemService) {
  let closed = false

  return async () => {
    if (closed) return

    closed = true
    terminal.dispose()
    await fs.close()
    await flushObservability()
  }
}

function appErrorPayload(
  code: unknown,
  error: unknown,
  set: {
    status?: number | string
  },
) {
  const responseError = errorForResponse(code, error)
  set.status = responseError.statusCode
  recordRequestContext({
    errorCode: responseError.code,
    status: responseError.statusCode,
  })
  recordRequestError(responseError, {
    area: 'server',
    operation: 'request_error',
    status: responseError.statusCode,
  })

  return responseErrorPayload(responseError)
}

function errorForResponse(code: unknown, error: unknown) {
  if (isFsError(error)) return error
  if (isEvlogError(error)) return error
  if (code === 'VALIDATION') return new FsError('INVALID_PATH', errorMessage(error))

  return new FsError('OPERATION_FAILED', undefined, error)
}

function responseErrorPayload(error: { code?: string; message: string; statusCode: number }) {
  if (isFsError(error)) return errorPayload(error)

  return {
    error: {
      code: error.code ?? 'OPERATION_FAILED',
      message: error.message,
    },
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message

  return String(error)
}
