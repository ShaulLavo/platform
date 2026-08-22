import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { attachmentRoutes } from './attachments/routes'
import { authGuard, createAuthConfig, isCorsOriginAllowed, type AuthOptions } from './auth'
import { getDefaultPlatformDatabase } from './db/client'
import { fontRoutes } from './fonts/routes'
import { NerdFontService, type FontService } from './fonts/service'
import { errorPayload, FsError, isFsError } from './fs/errors'
import { fsRoutes } from './fs/routes'
import { FileSystemService, type FileSystemServiceOptions } from './fs/service'
import { gitRoutes } from './git/routes'
import { GitService } from './git/service'
import { setLspDownloadPolicy } from './lsp/installers'
import { LspSessionPool } from './lsp/proxy-session'
import { lspMatchQuerySchema, lspRouteMatch, lspRouteSemanticTokens, lspRoutes } from './lsp/routes'
import {
  applyObservability,
  flushObservability,
  isEvlogError,
  observabilityRoutes,
  recordClientInstance,
  recordRequestContext,
  recordRequestError,
  runDetached,
} from './observability'
import { OrchestrationEngine } from './orchestration/engine'
import { OrchestrationCheckpointDiffQuery } from './orchestration/checkpoint-diff-query'
import type { OrchestrationDatabase } from './orchestration/event-store'
import { orchestrationRoutes } from './orchestration/routes'
import { OrchestrationThreadSearchQuery } from './orchestration/thread-search-query'
import { orchestrationWsRoutes } from './orchestration/ws-rpc'
import {
  createDefaultProviderAdapterRegistry,
  type ProviderAdapterRegistry,
} from './provider/provider-adapter-registry'
import { providerRoutes } from './provider/routes'
import { settingsRoutes } from './settings/routes'
import { DEFAULT_PROVIDER_INSTANCES } from './provider/drivers/built-in'
import { mergeProviderInstanceConfigs } from './provider/utils/instance-config-merge'
import { SettingsStore, type SettingsStoreOptions } from './settings/store'
import { TerminalService, type TerminalPtyFactory } from './terminal/service'
import { wallpaperRoutes } from './wallpaper/routes'
import { isActiveBinding, ProviderSessionDirectory } from './provider/provider-session-directory'

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
  lsp?: {
    /**
     * Test seam: inject a pool so a test can put a fake backend in it and
     * assert `closeApp` killed it. Production always builds its own.
     */
    pool?: LspSessionPool
  }
  /**
   * Required in practice. `settingsPaths` throws `settings.FILE_PATH_UNSET`
   * without a user file path rather than defaulting to the home directory —
   * there are fifteen `createApp` call sites, and a forgotten one silently
   * reading and overwriting the developer's real settings is not recoverable,
   * because this repo deliberately keeps no healing code.
   */
  settings?: Omit<SettingsStoreOptions, 'workspaceRoot'>
}

const appCleanups = new WeakMap<object, () => Promise<void>>()

export function createApp(options: AppOptions) {
  const fs = new FileSystemService(options)
  const git = new GitService(fs.paths, {
    maxTextFileBytes: fs.info().maxTextFileBytes,
  })
  const terminal = new TerminalService(Object.assign({ paths: fs.paths }, options.terminal))
  const fonts = options.fonts ?? new NerdFontService()
  const database = options.orchestration?.database ?? getDefaultPlatformDatabase()
  // Before the registry, because the registry is built *from* it. One SQLite
  // file backs the whole platform, so settings ride on whichever handle this
  // app was given — in tests that is the in-memory database, which is what
  // keeps a test run from writing into the developer's real settings.
  const settings = new SettingsStore({ ...options.settings, workspaceRoot: fs.paths.workspaceRoot })
  const providerAdapterRegistry =
    options.orchestration?.providerAdapterRegistry ??
    createDefaultProviderAdapterRegistry(
      mergeProviderInstanceConfigs(
        DEFAULT_PROVIDER_INSTANCES,
        // Secrets put back before the first spawn, not after the first settings
        // write: `snapshot()` masks the provider environment, and handing the
        // mask to the registry launches every provider with `••••••••` as its
        // credential until something happens to touch settings.
        settings.providerInstancesForSpawnSync(),
      ),
      {
        // Disabling a provider must not kill a turn that is mid-stream. The
        // registry defers disposal while the directory still lists a session on
        // that instance, and removes it on the next reconcile once the turn ends.
        //
        // Filtered on status: rows outlive their turns — nothing deletes them —
        // so an unfiltered scan reports every instance ever used as live, and
        // the deferral would never resolve.
        hasLiveSessions: (providerInstanceId) =>
          new ProviderSessionDirectory(database)
            .listBindings()
            .some(
              (binding) =>
                binding.providerInstanceId === providerInstanceId && isActiveBinding(binding),
            ),
      },
    )
  // A saved provider list is inert unless something re-runs the registry when
  // it changes. Without this the settings UI writes rows the server never reads
  // until the next restart.
  //
  // Secrets are resolved here rather than in the snapshot: the values a provider
  // spawns with never appear in anything a route can return.
  const reconcileProviderSettings = providerSettingsReconciler(settings, providerAdapterRegistry)
  settings.onChange(() => {
    runDetached(reconcileProviderSettings, { area: 'provider', operation: 'reconcile' })
  })
  const orchestration = new OrchestrationEngine(database, {
    providerRuntime: options.orchestration?.providerRuntime
      ? { adapterRegistry: providerAdapterRegistry, checkpointGit: git }
      : false,
  })
  const checkpointDiff = new OrchestrationCheckpointDiffQuery(database, git)
  const threadSearch = new OrchestrationThreadSearchQuery(database)
  const auth = createAuthConfig(options.auth)
  // Read through the store on every call rather than captured once: a language
  // server that only picked up a settings change on restart would be a knob the
  // page claims is live and is not.
  const lspSettings = () => {
    // One snapshot per call: `snapshot()` re-resolves every layer, so reading
    // two keys through two calls would resolve the whole document twice per
    // `/lsp/match` request.
    const { values } = settings.snapshot()

    return {
      servers: values['lsp.servers'],
      languageServers: values['lsp.languageServers'],
      tyForPython: values['lsp.experimental.tyForPython'],
    }
  }
  // The one knob that cannot be threaded as a parameter — see the comment on
  // `setLspDownloadPolicy`.
  setLspDownloadPolicy(() => settings.snapshot().values['lsp.downloadRuntimes'])
  const lspPool =
    options.lsp?.pool ??
    new LspSessionPool(
      () => settings.snapshot().values['lsp.idleTimeoutMs'],
      () => settings.snapshot().values['lsp.semanticTokens.delta'],
    )
  const cleanup = appCleanup(terminal, fs, settings, lspPool)

  const app = new Elysia({ name: 'platform' })
  applyObservability(app)

  const configured = app
    .use(
      cors({
        allowedHeaders: ['authorization', 'content-type', 'x-client-instance', 'x-evlog-source'],
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
    .onBeforeHandle(({ request }) => {
      recordClientInstance(request)
    })
    .onBeforeHandle(authGuard(auth))
    .use(observabilityRoutes())
    .get('/health', () => ({
      ok: true,
      ...fs.info(),
    }))
    .get('/lsp/match', ({ query }) => lspRouteMatch(fs.paths, query, lspSettings()), {
      query: lspMatchQuerySchema,
    })
    .get(
      '/lsp/semantic-tokens',
      ({ query }) => lspRouteSemanticTokens(fs.paths, query, lspSettings(), lspPool),
      { query: lspMatchQuerySchema },
    )
    .ws('/lsp', lspRoutes(fs, auth, { pool: lspPool, settings: lspSettings }))
    .ws('/terminal', terminal.routes(auth))
    .use(providerRoutes(providerAdapterRegistry))
    .use(orchestrationWsRoutes(orchestration, auth))
    .use(orchestrationRoutes(orchestration, checkpointDiff, threadSearch))
    .use(attachmentRoutes())
    .use(fontRoutes(fonts))
    .use(wallpaperRoutes())
    .use(settingsRoutes(settings))
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

function providerSettingsReconciler(
  settings: SettingsStore,
  providerAdapterRegistry: ProviderAdapterRegistry,
) {
  let current = settings.providerInstancesForSpawnSync()

  return async () => {
    const next = await settings.providerInstancesForSpawn()
    if (providerInstancesEqual(current, next)) return

    current = next
    await providerAdapterRegistry.reconcile(
      mergeProviderInstanceConfigs(DEFAULT_PROVIDER_INSTANCES, next),
    )
  }
}

function providerInstancesEqual(
  left: ReturnType<SettingsStore['providerInstancesForSpawnSync']>,
  right: ReturnType<SettingsStore['providerInstancesForSpawnSync']>,
) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function appCleanup(
  terminal: TerminalService,
  fs: FileSystemService,
  settings: SettingsStore,
  lspPool: LspSessionPool,
) {
  let closed = false

  return async () => {
    if (closed) return

    closed = true
    terminal.dispose()
    // Language servers are child processes. Without this, jdtls, gopls and
    // rust-analyzer outlive the server and idle on the machine until someone
    // notices and kills them by hand.
    lspPool.disposeAll()
    // Releases the settings file watchers; without this a test run leaks a
    // native handle per app it builds.
    settings.close()
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
