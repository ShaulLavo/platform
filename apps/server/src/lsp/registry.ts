import type { LspServerOverride, LspServerOverrides } from '@workspace/contracts'
import { access, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import {
  spawnBiome,
  spawnClangd,
  spawnCommand,
  spawnDotnetTool,
  spawnElixirLs,
  spawnGemTool,
  spawnGoTool,
  spawnJdtls,
  spawnKotlinLs,
  spawnLuaLs,
  spawnNodePackageBin,
  spawnOxlint,
  spawnSourceKit,
  spawnTerraformLs,
  spawnTexlab,
  spawnTinymist,
  spawnRustAnalyzer,
  spawnTy,
  spawnZls,
} from './installers'
import { fileExtension } from './language'

export type LspServerHandle = {
  readonly process: ChildProcessWithoutNullStreams
}

export type LspServerDefinition = {
  readonly id: string
  readonly extensions: readonly string[]
  readonly root: (filePath: string, workspaceRoot: string) => Promise<string | null>
  readonly spawn: (root: string) => Promise<LspServerHandle | null>
  readonly initializationOptions?: (root: string) => Promise<Record<string, unknown> | undefined>
  /**
   * What this server gets back when it asks `workspace/configuration`.
   *
   * A settings tree, resolved per requested `section` by dotted path. Static
   * data rather than a function because a configuration reply is a statement
   * about the *server*, not about the root or the client: every tab sharing a
   * pooled backend must see the same answer, and the proxy answers this request
   * on the backend's behalf without any client involved.
   *
   * It exists because the blanket `[{}]` this proxy used to send is not a
   * neutral answer. gopls reads `semanticTokens` out of it, so an empty object
   * meant gopls advertised `semanticTokensProvider: { full: true, range: true }`
   * and then returned **zero** tokens for every file — a capability that is
   * advertised and then answers empty, which is indistinguishable from a boring
   * file. The same request with `{ semanticTokens: true }` returned 3 818.
   */
  readonly configuration?: Readonly<Record<string, unknown>>
}

export type LspServerMatch = {
  readonly root: string
  readonly server: LspServerDefinition
}

/**
 * What the registry needs from settings, resolved by the caller.
 *
 * Passed in rather than read here: the module used to snapshot `process.env` at
 * import, which made the experimental flag a one-way latch no test could clear.
 * A plain value parameter is the property that bug cost us.
 */
export type LspSettings = {
  readonly servers: LspServerOverrides
  readonly tyForPython: boolean
}

const serverPriority = ['deno', 'typescript', 'vue', 'eslint', 'oxlint', 'biome'] as const

const jsProjectMarkers = [
  'package-lock.json',
  'bun.lockb',
  'bun.lock',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package.json',
] as const

const tsExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'] as const

const lspServers: readonly LspServerDefinition[] = [
  {
    id: 'astro',
    extensions: ['.astro'],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, jsProjectMarkers),
    spawn: (root) =>
      spawnNodePackageBin('@astrojs/language-server', 'astro-ls', ['--stdio'], {
        cwd: root,
      }),
    initializationOptions: async (root) => {
      const tsserver = await findUp(path.resolve(root), root, [
        'node_modules/typescript/lib/tsserver.js',
      ])
      if (!tsserver) return undefined

      return { typescript: { tsdk: path.dirname(tsserver) } }
    },
  },
  {
    id: 'bash',
    extensions: ['.sh', '.bash', '.zsh', '.ksh'],
    root: async (_filePath, workspaceRoot) => workspaceRoot,
    spawn: (root) =>
      spawnNodePackageBin('bash-language-server', 'bash-language-server', ['start'], { cwd: root }),
  },
  {
    id: 'clangd',
    extensions: ['.c', '.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hh', '.hxx', '.h++'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        'compile_commands.json',
        'compile_flags.txt',
        '.clangd',
        'CMakeLists.txt',
        'Makefile',
      ]),
    spawn: (root) => spawnClangd(root),
  },
  {
    id: 'clojure-lsp',
    extensions: ['.clj', '.cljs', '.cljc', '.edn'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        'deps.edn',
        'project.clj',
        'shadow-cljs.edn',
        'bb.edn',
        'build.boot',
      ]),
    spawn: (root) => spawnCommand(['clojure-lsp', 'listen'], { cwd: root }),
  },
  {
    id: 'csharp',
    extensions: ['.cs'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['.slnx', '.sln', '.csproj', 'global.json']),
    spawn: (root) => spawnDotnetTool('csharp-ls', 'csharp-ls', root),
  },
  {
    id: 'dart',
    extensions: ['.dart'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['pubspec.yaml', 'analysis_options.yaml']),
    spawn: (root) => spawnCommand(['dart', 'language-server', '--lsp'], { cwd: root }),
  },
  {
    id: 'deno',
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['deno.json', 'deno.jsonc'], {
        fallback: false,
      }),
    spawn: (root) => spawnCommand(['deno', 'lsp'], { cwd: root }),
  },
  {
    id: 'dockerfile',
    extensions: ['.dockerfile', 'Dockerfile'],
    root: async (_filePath, workspaceRoot) => workspaceRoot,
    spawn: (root) =>
      spawnNodePackageBin('dockerfile-language-server-nodejs', 'docker-langserver', ['--stdio'], {
        cwd: root,
      }),
  },
  {
    id: 'elixir-ls',
    extensions: ['.ex', '.exs'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['mix.exs', 'mix.lock']),
    spawn: (root) => spawnElixirLs(root),
  },
  {
    id: 'eslint',
    extensions: Array.from<string>(tsExtensions).concat('.vue'),
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, jsProjectMarkers),
    spawn: (root) =>
      spawnNodePackageBin(
        'vscode-langservers-extracted',
        'vscode-eslint-language-server',
        ['--stdio'],
        {
          cwd: root,
        },
      ),
  },
  {
    id: 'fsharp',
    extensions: ['.fs', '.fsi', '.fsx', '.fsscript'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['.slnx', '.sln', '.fsproj', 'global.json']),
    spawn: (root) => spawnDotnetTool('fsautocomplete', 'fsautocomplete', root),
  },
  {
    id: 'gleam',
    extensions: ['.gleam'],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ['gleam.toml']),
    spawn: (root) => spawnCommand(['gleam', 'lsp'], { cwd: root }),
  },
  {
    id: 'gopls',
    extensions: ['.go'],
    root: async (filePath, workspaceRoot) =>
      (await nearestRoot(filePath, workspaceRoot, ['go.work'], {
        fallback: false,
      })) ?? nearestRoot(filePath, workspaceRoot, ['go.mod', 'go.sum']),
    spawn: (root) => spawnGoTool('gopls', 'golang.org/x/tools/gopls@latest', root),
    // gopls asks under its own section name and reads `semanticTokens` from the
    // answer. Measured on v0.21.0 against `net/http/request.go` (50.4 KB): with
    // the old blanket `[{}]`, 0 tokens for both `full` and `range`; with this,
    // 3 818.
    configuration: { gopls: { semanticTokens: true } },
  },
  {
    id: 'haskell-language-server',
    extensions: ['.hs', '.lhs'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['stack.yaml', 'cabal.project', 'hie.yaml', '*.cabal']),
    spawn: (root) => spawnCommand(['haskell-language-server-wrapper', '--lsp'], { cwd: root }),
  },
  {
    id: 'jdtls',
    extensions: ['.java'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        'pom.xml',
        'build.gradle',
        'build.gradle.kts',
        '.project',
        '.classpath',
        'settings.gradle',
        'settings.gradle.kts',
        'gradlew',
        'gradlew.bat',
      ]),
    spawn: (root) => spawnJdtls(root),
  },
  {
    id: 'julials',
    extensions: ['.jl'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['Project.toml', 'Manifest.toml', '*.jl']),
    spawn: (root) =>
      spawnCommand(
        [
          'julia',
          '--startup-file=no',
          '--history-file=no',
          '-e',
          'using LanguageServer; runserver()',
        ],
        {
          cwd: root,
        },
      ),
  },
  {
    id: 'kotlin-ls',
    extensions: ['.kt', '.kts'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        'settings.gradle.kts',
        'settings.gradle',
        'gradlew',
        'gradlew.bat',
        'build.gradle.kts',
        'build.gradle',
        'pom.xml',
      ]),
    spawn: (root) => spawnKotlinLs(root),
  },
  {
    id: 'lua-ls',
    extensions: ['.lua'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        '.luarc.json',
        '.luarc.jsonc',
        '.luacheckrc',
        '.stylua.toml',
        'stylua.toml',
        'selene.toml',
        'selene.yml',
      ]),
    spawn: (root) => spawnLuaLs(root),
  },
  {
    id: 'nixd',
    extensions: ['.nix'],
    root: async (filePath, workspaceRoot) =>
      (await nearestRoot(filePath, workspaceRoot, ['flake.nix'], {
        fallback: false,
      })) ?? workspaceRoot,
    spawn: (root) => spawnCommand(['nixd'], { cwd: root }),
  },
  {
    id: 'ocaml-lsp',
    extensions: ['.ml', '.mli'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['dune-project', 'dune-workspace', '.merlin', 'opam']),
    spawn: (root) => spawnCommand(['ocamllsp'], { cwd: root }),
  },
  {
    id: 'oxlint',
    extensions: Array.from<string>(tsExtensions).concat('.vue', '.astro', '.svelte'),
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['.oxlintrc.json', ...jsProjectMarkers]),
    spawn: (root) => spawnOxlint(root),
  },
  {
    id: 'biome',
    extensions: [
      ...tsExtensions,
      '.json',
      '.jsonc',
      '.vue',
      '.astro',
      '.svelte',
      '.css',
      '.graphql',
      '.gql',
      '.html',
    ],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['biome.json', 'biome.jsonc', ...jsProjectMarkers]),
    spawn: (root) => spawnBiome(root),
  },
  {
    id: 'php intelephense',
    extensions: ['.php'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['composer.json', 'composer.lock', '.php-version']),
    spawn: (root) =>
      spawnNodePackageBin('intelephense', 'intelephense', ['--stdio'], {
        cwd: root,
      }),
    initializationOptions: async () => ({ telemetry: { enabled: false } }),
  },
  {
    id: 'prisma',
    extensions: ['.prisma'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['schema.prisma', 'prisma/schema.prisma', 'prisma'], {
        exclude: ['package.json'],
      }),
    spawn: (root) => spawnCommand(['prisma', 'language-server'], { cwd: root }),
  },
  {
    id: 'pyright',
    extensions: ['.py', '.pyi'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        'pyproject.toml',
        'setup.py',
        'setup.cfg',
        'requirements.txt',
        'Pipfile',
        'pyrightconfig.json',
      ]),
    spawn: (root) =>
      spawnNodePackageBin('pyright', 'pyright-langserver', ['--stdio'], {
        cwd: root,
      }),
    initializationOptions: pythonInitializationOptions,
  },
  {
    id: 'ruby-lsp',
    extensions: ['.rb', '.rake', '.gemspec', '.ru'],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ['Gemfile']),
    spawn: (root) => spawnGemTool('rubocop', 'rubocop', ['--lsp'], root),
  },
  {
    id: 'rust',
    extensions: ['.rs'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['Cargo.toml', 'Cargo.lock']),
    spawn: (root) => spawnRustAnalyzer(root),
  },
  {
    id: 'sourcekit-lsp',
    extensions: ['.swift', '.objc', '.objcpp'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['Package.swift', '*.xcodeproj', '*.xcworkspace']),
    spawn: (root) => spawnSourceKit(root),
  },
  {
    id: 'svelte',
    extensions: ['.svelte'],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, jsProjectMarkers),
    spawn: (root) =>
      spawnNodePackageBin('svelte-language-server', 'svelteserver', ['--stdio'], { cwd: root }),
    initializationOptions: async () => ({}),
  },
  {
    id: 'terraform',
    extensions: ['.tf', '.tfvars'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ['.terraform.lock.hcl', 'terraform.tfstate', '*.tf']),
    spawn: (root) => spawnTerraformLs(root),
    initializationOptions: async () => ({
      experimentalFeatures: {
        prefillRequiredFields: true,
        validateOnSave: true,
      },
    }),
  },
  {
    id: 'texlab',
    extensions: ['.tex', '.bib'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        '.latexmkrc',
        'latexmkrc',
        '.texlabroot',
        'texlabroot',
      ]),
    spawn: (root) => spawnTexlab(root),
  },
  {
    id: 'tinymist',
    extensions: ['.typ', '.typc'],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ['typst.toml']),
    spawn: (root) => spawnTinymist(root),
  },
  {
    id: 'ty',
    extensions: ['.py', '.pyi'],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        'pyproject.toml',
        'ty.toml',
        'setup.py',
        'setup.cfg',
        'requirements.txt',
        'Pipfile',
        'pyrightconfig.json',
      ]),
    spawn: (root) => spawnTy(root),
    initializationOptions: pythonInitializationOptions,
  },
  {
    id: 'typescript',
    extensions: tsExtensions,
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, jsProjectMarkers, {
        exclude: ['deno.json', 'deno.jsonc'],
      }),
    spawn: (root) =>
      spawnNodePackageBin('typescript-language-server', 'typescript-language-server', ['--stdio'], {
        cwd: root,
      }),
    initializationOptions: async (root) => {
      const tsserver = await findUp(path.resolve(root), root, [
        'node_modules/typescript/lib/tsserver.js',
      ])
      if (!tsserver) return undefined

      return { tsserver: { path: tsserver } }
    },
  },
  {
    id: 'vue',
    extensions: ['.vue'],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, jsProjectMarkers),
    spawn: (root) =>
      spawnNodePackageBin('@vue/language-server', 'vue-language-server', ['--stdio'], {
        cwd: root,
      }),
    initializationOptions: async () => ({}),
  },
  {
    id: 'yaml-ls',
    extensions: ['.yaml', '.yml'],
    root: async (_filePath, workspaceRoot) => workspaceRoot,
    spawn: (root) =>
      spawnNodePackageBin('yaml-language-server', 'yaml-language-server', ['--stdio'], {
        cwd: root,
      }),
  },
  {
    id: 'zls',
    extensions: ['.zig', '.zon'],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ['build.zig']),
    spawn: (root) => spawnZls(root),
  },
]

export async function matchLspServer(input: {
  filePath: string
  serverId?: string | null
  settings: LspSettings
  workspaceRoot: string
}) {
  const extension = fileExtension(input.filePath)
  const candidates = lspServersFor(input.settings)
    .filter((server) => serverMatches(server, extension, input.serverId))
    .sort(compareServerPriority)

  for (const server of candidates) {
    const root = await server.root(input.filePath, input.workspaceRoot)
    if (!root) continue

    return { root, server } satisfies LspServerMatch
  }

  return null
}

export function lspServersFor(settings: LspSettings) {
  const base = experimentalFilteredServers(settings.tyForPython)
  const overrides = Object.entries(settings.servers)
  if (overrides.length === 0) return base

  const servers = new Map(base.map((server) => [server.id, server]))
  for (const [id, config] of overrides) {
    if (config.disabled) {
      servers.delete(id)
      continue
    }

    const existing = servers.get(id)
    if (!config.command && !existing) continue

    servers.set(id, configuredServer(id, config, existing))
  }

  return Array.from(servers.values())
}

function experimentalFilteredServers(tyForPython: boolean) {
  if (tyForPython) return lspServers.filter((server) => server.id !== 'pyright')

  return lspServers.filter((server) => server.id !== 'ty')
}

async function nearestRoot(
  filePath: string,
  workspaceRoot: string,
  markers: readonly string[],
  options: {
    readonly exclude?: readonly string[]
    readonly fallback?: boolean
  } = {},
) {
  const excluded = await findUp(path.dirname(filePath), workspaceRoot, options.exclude ?? [])
  if (excluded) return null

  const marker = await findUp(path.dirname(filePath), workspaceRoot, markers)
  if (marker) return path.dirname(marker)
  if (options.fallback === false) return null

  return workspaceRoot
}

async function findUp(start: string, stop: string, markers: readonly string[]) {
  if (markers.length === 0) return null

  let current = path.resolve(start)
  const root = path.resolve(stop)
  while (isInsideOrEqual(root, current)) {
    const match = await firstExistingMarker(current, markers)
    if (match) return match
    if (current === root) return null

    current = path.dirname(current)
  }

  return null
}

async function firstExistingMarker(directory: string, markers: readonly string[]) {
  for (const marker of markers) {
    const candidate = await existingMarker(directory, marker)
    if (!candidate) continue

    return candidate
  }

  return null
}

async function existingMarker(directory: string, marker: string) {
  if (!marker.includes('*')) {
    const candidate = path.join(directory, marker)
    return (await exists(candidate)) ? candidate : null
  }

  const matcher = globMarkerRegex(marker)
  const entries = await readdir(directory).catch(() => [])
  const match = entries.find((entry) => matcher.test(entry))
  return match ? path.join(directory, match) : null
}

function configuredServer(
  id: string,
  config: LspServerOverride,
  existing: LspServerDefinition | undefined,
): LspServerDefinition {
  const command = config.command
  if (!command) {
    return {
      ...existing!,
      extensions: config.extensions ?? existing!.extensions,
      initializationOptions: configuredInitialization(config, existing),
    }
  }

  return {
    id,
    extensions: config.extensions ?? existing?.extensions ?? [],
    root: existing?.root ?? (async (_filePath, workspaceRoot) => workspaceRoot),
    spawn: (root) =>
      spawnCommand(command, {
        cwd: root,
        env: {
          ...process.env,
          ...config.env,
        },
      }),
    initializationOptions: configuredInitialization(config, existing),
    // Carried across a command override on purpose: pointing `gopls` at a
    // different binary does not stop it being gopls, and dropping the reply here
    // would silently turn its semantic tokens back off.
    configuration: existing?.configuration,
  }
}

function configuredInitialization(
  config: LspServerOverride,
  existing: LspServerDefinition | undefined,
) {
  if (!config.initialization) return existing?.initializationOptions

  return async () => config.initialization
}

async function pythonInitializationOptions(root: string) {
  const pythonPath = await firstExistingPath(
    virtualEnvironmentPaths(root).map((venvPath) =>
      process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python'),
    ),
  )
  if (!pythonPath) return undefined

  return { pythonPath }
}

function serverMatches(
  server: LspServerDefinition,
  extension: string,
  serverId: string | null | undefined,
) {
  if (serverId && server.id !== serverId) return false

  return server.extensions.includes(extension)
}

function compareServerPriority(left: LspServerDefinition, right: LspServerDefinition) {
  return serverPriorityIndex(left.id) - serverPriorityIndex(right.id)
}

function serverPriorityIndex(id: string) {
  const index = serverPriority.indexOf(id as (typeof serverPriority)[number])
  return index === -1 ? serverPriority.length : index
}

async function firstExistingPath(candidates: readonly string[]) {
  for (const candidate of candidates) {
    if (!(await exists(candidate))) continue

    return candidate
  }

  return null
}

async function exists(candidate: string) {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

function virtualEnvironmentPaths(root: string) {
  return [process.env.VIRTUAL_ENV, path.join(root, '.venv'), path.join(root, 'venv')].filter(
    (item): item is string => Boolean(item),
  )
}

function isInsideOrEqual(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  if (relative === '') return true
  if (relative.startsWith('..')) return false

  return !path.isAbsolute(relative)
}

function globMarkerRegex(marker: string) {
  const escaped = marker.replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
  return new RegExp(`^${escaped.replaceAll('\\*', '.*')}$`, 'u')
}
