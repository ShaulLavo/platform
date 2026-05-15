import { accessSync, constants } from "node:fs"
import {
  access,
  chmod,
  mkdir,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"

import { fileExtension } from "./language"

export type LspServerHandle = {
  readonly process: ChildProcessWithoutNullStreams
}

export type LspServerDefinition = {
  readonly id: string
  readonly extensions: readonly string[]
  readonly root: (filePath: string, workspaceRoot: string) => Promise<string | null>
  readonly spawn: (root: string) => Promise<LspServerHandle | null>
  readonly initializationOptions?: (root: string) => Promise<Record<string, unknown> | undefined>
}

export type LspServerMatch = {
  readonly root: string
  readonly server: LspServerDefinition
}

type LspConfig = Record<
  string,
  {
    readonly command?: readonly string[]
    readonly disabled?: boolean
    readonly env?: Record<string, string>
    readonly extensions?: readonly string[]
    readonly initialization?: Record<string, unknown>
  }
>

type CommandOptions = {
  readonly cwd: string
  readonly env?: NodeJS.ProcessEnv
}

type GitHubAssetRelease = {
  readonly assets?: readonly {
    readonly browser_download_url?: string
    readonly name?: string
  }[]
  readonly name?: string
  readonly tag_name?: string
}

type HashiCorpRelease = {
  readonly builds?: readonly {
    readonly arch?: string
    readonly os?: string
    readonly url?: string
  }[]
  readonly version?: string
}

const lspRoot = path.join(homedir(), ".platform", "lsp")
const nodePackageRoot = path.join(lspRoot, "node")
const toolRoot = path.join(lspRoot, "bin")
const nodePackageBin = path.join(nodePackageRoot, "node_modules", ".bin")
const disableDownloads = truthy(process.env.FS_DISABLE_LSP_DOWNLOAD)
const useTyForPython = truthy(process.env.FS_EXPERIMENTAL_LSP_TY)
const serverPriority = [
  "deno",
  "typescript",
  "vue",
  "eslint",
  "oxlint",
  "biome",
] as const

const jsProjectMarkers = [
  "package-lock.json",
  "bun.lockb",
  "bun.lock",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package.json",
] as const

const tsExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"] as const

export const lspServers: readonly LspServerDefinition[] = [
  {
    id: "astro",
    extensions: [".astro"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, jsProjectMarkers),
    spawn: (root) => spawnNodePackageBin("@astrojs/language-server", "astro-ls", ["--stdio"], { cwd: root }),
    initializationOptions: async (root) => {
      const tsserver = await findUp(path.resolve(root), root, ["node_modules/typescript/lib/tsserver.js"])
      if (!tsserver) return undefined

      return { typescript: { tsdk: path.dirname(tsserver) } }
    },
  },
  {
    id: "bash",
    extensions: [".sh", ".bash", ".zsh", ".ksh"],
    root: async (_filePath, workspaceRoot) => workspaceRoot,
    spawn: (root) => spawnNodePackageBin("bash-language-server", "bash-language-server", ["start"], { cwd: root }),
  },
  {
    id: "clangd",
    extensions: [".c", ".cpp", ".cc", ".cxx", ".c++", ".h", ".hpp", ".hh", ".hxx", ".h++"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        "compile_commands.json",
        "compile_flags.txt",
        ".clangd",
        "CMakeLists.txt",
        "Makefile",
      ]),
    spawn: (root) => spawnClangd(root),
  },
  {
    id: "clojure-lsp",
    extensions: [".clj", ".cljs", ".cljc", ".edn"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ["deps.edn", "project.clj", "shadow-cljs.edn", "bb.edn", "build.boot"]),
    spawn: (root) => spawnCommand(["clojure-lsp", "listen"], { cwd: root }),
  },
  {
    id: "csharp",
    extensions: [".cs"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [".slnx", ".sln", ".csproj", "global.json"]),
    spawn: (root) => spawnDotnetTool("csharp-ls", "csharp-ls", root),
  },
  {
    id: "dart",
    extensions: [".dart"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ["pubspec.yaml", "analysis_options.yaml"]),
    spawn: (root) => spawnCommand(["dart", "language-server", "--lsp"], { cwd: root }),
  },
  {
    id: "deno",
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ["deno.json", "deno.jsonc"], {
        fallback: false,
      }),
    spawn: (root) => spawnCommand(["deno", "lsp"], { cwd: root }),
  },
  {
    id: "dockerfile",
    extensions: [".dockerfile", "Dockerfile"],
    root: async (_filePath, workspaceRoot) => workspaceRoot,
    spawn: (root) =>
      spawnNodePackageBin("dockerfile-language-server-nodejs", "docker-langserver", ["--stdio"], { cwd: root }),
  },
  {
    id: "elixir-ls",
    extensions: [".ex", ".exs"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ["mix.exs", "mix.lock"]),
    spawn: (root) => spawnElixirLs(root),
  },
  {
    id: "eslint",
    extensions: [...tsExtensions, ".vue"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, jsProjectMarkers),
    spawn: (root) =>
      spawnNodePackageBin("vscode-langservers-extracted", "vscode-eslint-language-server", ["--stdio"], {
        cwd: root,
      }),
  },
  {
    id: "fsharp",
    extensions: [".fs", ".fsi", ".fsx", ".fsscript"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [".slnx", ".sln", ".fsproj", "global.json"]),
    spawn: (root) => spawnDotnetTool("fsautocomplete", "fsautocomplete", root),
  },
  {
    id: "gleam",
    extensions: [".gleam"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ["gleam.toml"]),
    spawn: (root) => spawnCommand(["gleam", "lsp"], { cwd: root }),
  },
  {
    id: "gopls",
    extensions: [".go"],
    root: async (filePath, workspaceRoot) =>
      (await nearestRoot(filePath, workspaceRoot, ["go.work"], { fallback: false })) ??
      nearestRoot(filePath, workspaceRoot, ["go.mod", "go.sum"]),
    spawn: (root) => spawnGoTool("gopls", "golang.org/x/tools/gopls@latest", root),
  },
  {
    id: "haskell-language-server",
    extensions: [".hs", ".lhs"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ["stack.yaml", "cabal.project", "hie.yaml", "*.cabal"]),
    spawn: (root) => spawnCommand(["haskell-language-server-wrapper", "--lsp"], { cwd: root }),
  },
  {
    id: "jdtls",
    extensions: [".java"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        "pom.xml",
        "build.gradle",
        "build.gradle.kts",
        ".project",
        ".classpath",
        "settings.gradle",
        "settings.gradle.kts",
        "gradlew",
        "gradlew.bat",
      ]),
    spawn: (root) => spawnJdtls(root),
  },
  {
    id: "julials",
    extensions: [".jl"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ["Project.toml", "Manifest.toml", "*.jl"]),
    spawn: (root) =>
      spawnCommand(["julia", "--startup-file=no", "--history-file=no", "-e", "using LanguageServer; runserver()"], {
        cwd: root,
      }),
  },
  {
    id: "kotlin-ls",
    extensions: [".kt", ".kts"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        "settings.gradle.kts",
        "settings.gradle",
        "gradlew",
        "gradlew.bat",
        "build.gradle.kts",
        "build.gradle",
        "pom.xml",
      ]),
    spawn: (root) => spawnKotlinLs(root),
  },
  {
    id: "lua-ls",
    extensions: [".lua"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        ".luarc.json",
        ".luarc.jsonc",
        ".luacheckrc",
        ".stylua.toml",
        "stylua.toml",
        "selene.toml",
        "selene.yml",
      ]),
    spawn: (root) => spawnLuaLs(root),
  },
  {
    id: "nixd",
    extensions: [".nix"],
    root: async (filePath, workspaceRoot) =>
      (await nearestRoot(filePath, workspaceRoot, ["flake.nix"], { fallback: false })) ?? workspaceRoot,
    spawn: (root) => spawnCommand(["nixd"], { cwd: root }),
  },
  {
    id: "ocaml-lsp",
    extensions: [".ml", ".mli"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ["dune-project", "dune-workspace", ".merlin", "opam"]),
    spawn: (root) => spawnCommand(["ocamllsp"], { cwd: root }),
  },
  {
    id: "oxlint",
    extensions: [...tsExtensions, ".vue", ".astro", ".svelte"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [".oxlintrc.json", ...jsProjectMarkers]),
    spawn: (root) => spawnOxlint(root),
  },
  {
    id: "biome",
    extensions: [
      ...tsExtensions,
      ".json",
      ".jsonc",
      ".vue",
      ".astro",
      ".svelte",
      ".css",
      ".graphql",
      ".gql",
      ".html",
    ],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ["biome.json", "biome.jsonc", ...jsProjectMarkers]),
    spawn: (root) => spawnBiome(root),
  },
  {
    id: "php intelephense",
    extensions: [".php"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ["composer.json", "composer.lock", ".php-version"]),
    spawn: (root) => spawnNodePackageBin("intelephense", "intelephense", ["--stdio"], { cwd: root }),
    initializationOptions: async () => ({ telemetry: { enabled: false } }),
  },
  {
    id: "prisma",
    extensions: [".prisma"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ["schema.prisma", "prisma/schema.prisma", "prisma"], {
        exclude: ["package.json"],
      }),
    spawn: (root) => spawnCommand(["prisma", "language-server"], { cwd: root }),
  },
  {
    id: "pyright",
    extensions: [".py", ".pyi"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        "pyproject.toml",
        "setup.py",
        "setup.cfg",
        "requirements.txt",
        "Pipfile",
        "pyrightconfig.json",
      ]),
    spawn: (root) => spawnNodePackageBin("pyright", "pyright-langserver", ["--stdio"], { cwd: root }),
    initializationOptions: pythonInitializationOptions,
  },
  {
    id: "ruby-lsp",
    extensions: [".rb", ".rake", ".gemspec", ".ru"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ["Gemfile"]),
    spawn: (root) => spawnGemTool("rubocop", "rubocop", ["--lsp"], root),
  },
  {
    id: "rust",
    extensions: [".rs"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ["Cargo.toml", "Cargo.lock"]),
    spawn: (root) => spawnCommand(["rust-analyzer"], { cwd: root }),
  },
  {
    id: "sourcekit-lsp",
    extensions: [".swift", ".objc", ".objcpp"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, ["Package.swift", "*.xcodeproj", "*.xcworkspace"]),
    spawn: (root) => spawnSourceKit(root),
  },
  {
    id: "svelte",
    extensions: [".svelte"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, jsProjectMarkers),
    spawn: (root) => spawnNodePackageBin("svelte-language-server", "svelteserver", ["--stdio"], { cwd: root }),
    initializationOptions: async () => ({}),
  },
  {
    id: "terraform",
    extensions: [".tf", ".tfvars"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [".terraform.lock.hcl", "terraform.tfstate", "*.tf"]),
    spawn: (root) => spawnTerraformLs(root),
    initializationOptions: async () => ({
      experimentalFeatures: {
        prefillRequiredFields: true,
        validateOnSave: true,
      },
    }),
  },
  {
    id: "texlab",
    extensions: [".tex", ".bib"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [".latexmkrc", "latexmkrc", ".texlabroot", "texlabroot"]),
    spawn: (root) => spawnTexlab(root),
  },
  {
    id: "tinymist",
    extensions: [".typ", ".typc"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ["typst.toml"]),
    spawn: (root) => spawnTinymist(root),
  },
  {
    id: "ty",
    extensions: [".py", ".pyi"],
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, [
        "pyproject.toml",
        "ty.toml",
        "setup.py",
        "setup.cfg",
        "requirements.txt",
        "Pipfile",
        "pyrightconfig.json",
      ]),
    spawn: (root) => spawnTy(root),
    initializationOptions: pythonInitializationOptions,
  },
  {
    id: "typescript",
    extensions: tsExtensions,
    root: (filePath, workspaceRoot) =>
      nearestRoot(filePath, workspaceRoot, jsProjectMarkers, {
        exclude: ["deno.json", "deno.jsonc"],
      }),
    spawn: (root) =>
      spawnNodePackageBin("typescript-language-server", "typescript-language-server", ["--stdio"], {
        cwd: root,
      }),
    initializationOptions: async (root) => {
      const tsserver = await findUp(path.resolve(root), root, ["node_modules/typescript/lib/tsserver.js"])
      if (!tsserver) return undefined

      return { tsserver: { path: tsserver } }
    },
  },
  {
    id: "vue",
    extensions: [".vue"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, jsProjectMarkers),
    spawn: (root) => spawnNodePackageBin("@vue/language-server", "vue-language-server", ["--stdio"], { cwd: root }),
    initializationOptions: async () => ({}),
  },
  {
    id: "yaml-ls",
    extensions: [".yaml", ".yml"],
    root: async (_filePath, workspaceRoot) => workspaceRoot,
    spawn: (root) => spawnNodePackageBin("yaml-language-server", "yaml-language-server", ["--stdio"], { cwd: root }),
  },
  {
    id: "zls",
    extensions: [".zig", ".zon"],
    root: (filePath, workspaceRoot) => nearestRoot(filePath, workspaceRoot, ["build.zig"]),
    spawn: (root) => spawnZls(root),
  },
]

export async function matchLspServer(input: {
  filePath: string
  serverId?: string | null
  workspaceRoot: string
}) {
  const extension = fileExtension(input.filePath)
  const candidates = lspServersForEnvironment()
    .filter((server) => serverMatches(server, extension, input.serverId))
    .sort(compareServerPriority)

  for (const server of candidates) {
    const root = await server.root(input.filePath, input.workspaceRoot)
    if (!root) continue

    return { root, server } satisfies LspServerMatch
  }

  return null
}

export function lspServersForEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const configured = lspConfigFromEnvironment(env)
  const base = experimentalFilteredServers(env)
  if (!configured) return base

  const servers = new Map(base.map((server) => [server.id, server]))
  for (const [id, config] of Object.entries(configured)) {
    if (config.disabled) {
      servers.delete(id)
      continue
    }

    const existing = servers.get(id)
    if (!config.command && !existing) continue

    servers.set(id, configuredServer(id, config, existing))
  }

  return [...servers.values()]
}

function experimentalFilteredServers(env: NodeJS.ProcessEnv) {
  const tyEnabled = truthy(env.FS_EXPERIMENTAL_LSP_TY) || useTyForPython
  if (tyEnabled) return lspServers.filter((server) => server.id !== "pyright")

  return lspServers.filter((server) => server.id !== "ty")
}

async function nearestRoot(
  filePath: string,
  workspaceRoot: string,
  markers: readonly string[],
  options: {
    readonly exclude?: readonly string[]
    readonly fallback?: boolean
  } = {}
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
  if (!marker.includes("*")) {
    const candidate = path.join(directory, marker)
    return (await exists(candidate)) ? candidate : null
  }

  const matcher = globMarkerRegex(marker)
  const entries = await readdir(directory).catch(() => [])
  const match = entries.find((entry) => matcher.test(entry))
  return match ? path.join(directory, match) : null
}

async function spawnNodePackageBin(
  packageName: string,
  commandName: string,
  args: readonly string[],
  options: CommandOptions
) {
  const bin = await resolvePackageBinary(packageName, commandName)
  if (!bin) return null

  return spawnCommand([bin, ...args], options)
}

async function spawnBiome(root: string) {
  const local = await findUp(root, root, [path.join("node_modules", ".bin", executableName("biome"))])
  const bin = local ?? which("biome")
  if (bin) return spawnCommand([bin, "lsp-proxy", "--stdio"], { cwd: root })

  return spawnNodePackageBin("biome", "biome", ["lsp-proxy", "--stdio"], { cwd: root })
}

async function spawnClangd(root: string) {
  const existing = which("clangd", [toolRoot])
  if (existing) return spawnCommand([existing, "--background-index", "--clang-tidy"], { cwd: root })

  const downloaded = await downloadClangd()
  if (!downloaded) return null

  return spawnCommand([downloaded, "--background-index", "--clang-tidy"], { cwd: root })
}

async function spawnDotnetTool(toolName: string, commandName: string, root: string) {
  const bin = which(commandName, [toolRoot])
  if (bin) return spawnCommand([bin], { cwd: root })
  if (!which("dotnet") || disableDownloads) return null

  const exit = await runCommand(["dotnet", "tool", "install", toolName, "--tool-path", toolRoot], { cwd: root })
  if (exit !== 0) return null

  return spawnCommand([commandName], { cwd: root })
}

async function spawnElixirLs(root: string) {
  const bin = which("elixir-ls", [toolRoot])
  if (bin) return spawnCommand([bin], { cwd: root })
  if (!which("elixir") || !which("mix") || disableDownloads) return null

  const script = await downloadElixirLs()
  if (!script) return null

  return spawnCommand([script], { cwd: root })
}

async function spawnGemTool(gemName: string, commandName: string, args: readonly string[], root: string) {
  const bin = which(commandName, [toolRoot])
  if (bin) return spawnCommand([bin, ...args], { cwd: root })
  if (!which("ruby") || !which("gem") || disableDownloads) return null

  const exit = await runCommand(["gem", "install", gemName, "--bindir", toolRoot], { cwd: root })
  if (exit !== 0) return null

  return spawnCommand([commandName, ...args], { cwd: root })
}

async function spawnGoTool(commandName: string, packageName: string, root: string) {
  const bin = which(commandName, [toolRoot])
  if (bin) return spawnCommand([bin], { cwd: root })
  if (!which("go") || disableDownloads) return null

  const exit = await runCommand(["go", "install", packageName], {
    cwd: root,
    env: { ...process.env, GOBIN: toolRoot },
  })
  if (exit !== 0) return null

  return spawnCommand([commandName], { cwd: root })
}

async function spawnJdtls(root: string) {
  const java = which("java")
  if (!java) return null

  const distPath = path.join(toolRoot, "jdtls")
  const launcher = await jdtlsLauncher(distPath)
  if (!launcher && !(await downloadJdtls(distPath))) return null

  const launcherJar = launcher ?? (await jdtlsLauncher(distPath))
  if (!launcherJar) return null

  const configFile = path.join(distPath, jdtlsConfigDirectory())
  const dataDir = path.join(toolRoot, "jdtls-workspaces", path.basename(root))
  await mkdir(dataDir, { recursive: true })

  return spawnCommand(
    [
      java,
      "-jar",
      launcherJar,
      "-configuration",
      configFile,
      "-data",
      dataDir,
      "-Declipse.application=org.eclipse.jdt.ls.core.id1",
      "-Dosgi.bundles.defaultStartLevel=4",
      "-Declipse.product=org.eclipse.jdt.ls.core.product",
      "--add-modules=ALL-SYSTEM",
      "--add-opens",
      "java.base/java.util=ALL-UNNAMED",
      "--add-opens",
      "java.base/java.lang=ALL-UNNAMED",
    ],
    { cwd: root }
  )
}

async function spawnKotlinLs(root: string) {
  const script = await kotlinLauncher()
  if (!script) return null

  return spawnCommand([script, "--stdio"], { cwd: root })
}

async function spawnLuaLs(root: string) {
  const bin = which("lua-language-server", [toolRoot])
  if (bin) return spawnCommand([bin], { cwd: root })

  const downloaded = await downloadLuaLs()
  if (!downloaded) return null

  return spawnCommand([downloaded], { cwd: root })
}

async function spawnOxlint(root: string) {
  const lintBin =
    (await findUp(root, root, [path.join("node_modules", ".bin", executableName("oxlint"))])) ??
    which("oxlint")

  if (lintBin && (await commandHelpIncludes(lintBin, "--lsp"))) {
    return spawnCommand([lintBin, "--lsp"], { cwd: root })
  }

  const serverBin =
    (await findUp(root, root, [path.join("node_modules", ".bin", executableName("oxc_language_server"))])) ??
    which("oxc_language_server")
  if (!serverBin) return null

  return spawnCommand([serverBin], { cwd: root })
}

async function spawnSourceKit(root: string) {
  const bin = which("sourcekit-lsp")
  if (bin) return spawnCommand([bin], { cwd: root })
  if (!which("xcrun")) return null

  const resolved = await commandOutput(["xcrun", "--find", "sourcekit-lsp"], { cwd: root })
  if (!resolved) return null

  return spawnCommand([resolved.trim()], { cwd: root })
}

async function spawnTy(root: string) {
  const fromPath = which("ty")
  if (fromPath) return spawnCommand([fromPath, "server"], { cwd: root })

  const venvBin = await firstExistingPath(
    virtualEnvironmentPaths(root).map((venvPath) =>
      process.platform === "win32"
        ? path.join(venvPath, "Scripts", "ty.exe")
        : path.join(venvPath, "bin", "ty")
    )
  )
  if (!venvBin) return null

  return spawnCommand([venvBin, "server"], { cwd: root })
}

async function spawnTerraformLs(root: string) {
  const bin = which("terraform-ls", [toolRoot])
  if (bin) return spawnCommand([bin, "serve"], { cwd: root })

  const downloaded = await downloadTerraformLs()
  if (!downloaded) return null

  return spawnCommand([downloaded, "serve"], { cwd: root })
}

async function spawnTexlab(root: string) {
  const bin = which("texlab", [toolRoot])
  if (bin) return spawnCommand([bin], { cwd: root })

  const downloaded = await downloadTexlab()
  if (!downloaded) return null

  return spawnCommand([downloaded], { cwd: root })
}

async function spawnTinymist(root: string) {
  const bin = which("tinymist", [toolRoot])
  if (bin) return spawnCommand([bin], { cwd: root })

  const downloaded = await downloadTinymist()
  if (!downloaded) return null

  return spawnCommand([downloaded], { cwd: root })
}

async function spawnZls(root: string) {
  const bin = which("zls", [toolRoot])
  if (bin) return spawnCommand([bin], { cwd: root })
  if (!which("zig")) return null

  const downloaded = await downloadZls()
  if (!downloaded) return null

  return spawnCommand([downloaded], { cwd: root })
}

function configuredServer(
  id: string,
  config: LspConfig[string],
  existing: LspServerDefinition | undefined
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
  }
}

function configuredInitialization(
  config: LspConfig[string],
  existing: LspServerDefinition | undefined
) {
  if (!config.initialization) return existing?.initializationOptions

  return async () => config.initialization
}

function lspConfigFromEnvironment(env: NodeJS.ProcessEnv): LspConfig | null {
  const raw = env.PLATFORM_LSP_CONFIG ?? env.FS_LSP_CONFIG
  if (!raw) return null

  try {
    return lspConfigFromValue(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

function lspConfigFromValue(value: unknown): LspConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const result: LspConfig = {}
  for (const [id, config] of Object.entries(value)) {
    const normalized = lspServerConfigFromValue(config)
    if (!normalized) continue

    result[id] = normalized
  }

  return result
}

function lspServerConfigFromValue(value: unknown): LspConfig[string] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  return {
    command: stringArray(record.command),
    disabled: record.disabled === true,
    env: stringRecord(record.env),
    extensions: stringArray(record.extensions),
    initialization: unknownRecord(record.initialization),
  }
}

async function resolvePackageBinary(packageName: string, commandName: string) {
  const local = await resolveLocalBinary(commandName)
  if (local) return local

  const global = which(commandName)
  if (global) return global
  if (disableDownloads) return null

  await ensureNodePackage(packageName)
  return resolveLocalBinary(commandName)
}

async function resolveLocalBinary(commandName: string) {
  const candidate = path.join(nodePackageBin, commandName)
  if (await exists(candidate)) return candidate
  if (process.platform !== "win32") return null

  const windowsCandidate = `${candidate}.cmd`
  return (await exists(windowsCandidate)) ? windowsCandidate : null
}

async function ensureNodePackage(packageName: string) {
  await mkdir(nodePackageRoot, { recursive: true })
  await ensurePackageJson()

  const exit = await runCommand([process.execPath, "add", packageName], {
    cwd: nodePackageRoot,
    env: { ...process.env, BUN_BE_BUN: "1" },
  })
  if (exit !== 0) throw new Error(`Failed to install ${packageName}`)
}

async function ensurePackageJson() {
  const packagePath = path.join(nodePackageRoot, "package.json")
  if (await exists(packagePath)) return

  await writeFile(packagePath, JSON.stringify({ private: true, type: "module" }, null, 2))
}

async function spawnCommand(command: readonly string[], options: CommandOptions) {
  const [binary, ...args] = command
  if (!binary) return null

  const resolved = path.isAbsolute(binary) ? binary : which(binary, [toolRoot, nodePackageBin])
  if (!resolved) return null

  return {
    process: spawn(resolved, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: "pipe",
    }),
  }
}

async function pythonInitializationOptions(root: string) {
  const pythonPath = await firstExistingPath(
    virtualEnvironmentPaths(root).map((venvPath) =>
      process.platform === "win32"
        ? path.join(venvPath, "Scripts", "python.exe")
        : path.join(venvPath, "bin", "python")
    )
  )
  if (!pythonPath) return undefined

  return { pythonPath }
}

async function downloadClangd() {
  const existing = await firstClangdInstall()
  if (existing) return existing
  if (disableDownloads) return null

  const release = await githubRelease("https://api.github.com/repos/clangd/clangd/releases/latest")
  const tag = release?.tag_name
  if (!release || !tag) return null

  const token = platformToken({ darwin: "mac", linux: "linux", win32: "windows" })
  const asset = release.assets?.find((item) => Boolean(item.name?.includes(token) && item.name.includes(tag)))
  if (!asset?.browser_download_url || !asset.name) return null

  const archive = await downloadAsset(asset.browser_download_url, asset.name)
  if (!archive) return null

  await extractArchive(archive, toolRoot)
  await rm(archive, { force: true })

  const bin = path.join(toolRoot, `clangd_${tag}`, "bin", executableName("clangd"))
  return (await makeExecutableIfExists(bin)) ? bin : null
}

async function downloadJdtls(distPath: string) {
  if (disableDownloads) return false

  await mkdir(distPath, { recursive: true })
  const url = "https://www.eclipse.org/downloads/download.php?file=/jdtls/snapshots/jdt-language-server-latest.tar.gz"
  const archive = path.join(distPath, "release.tar.gz")
  if (!(await downloadToFile(url, archive))) return false

  const exit = await runCommand(["tar", "-xzf", archive], { cwd: distPath })
  await rm(archive, { force: true })
  return exit === 0
}

async function downloadElixirLs() {
  const distPath = path.join(toolRoot, "elixir-ls-master")
  const script = path.join(distPath, "release", process.platform === "win32" ? "language_server.bat" : "language_server.sh")
  if (await exists(script)) return script

  const archive = await downloadAsset(
    "https://github.com/elixir-lsp/elixir-ls/archive/refs/heads/master.zip",
    "elixir-ls.zip"
  )
  if (!archive) return null

  await extractArchive(archive, toolRoot)
  await rm(archive, { force: true })

  const env = { ...process.env, MIX_ENV: "prod" }
  if ((await runCommand(["mix", "deps.get"], { cwd: distPath, env })) !== 0) return null
  if ((await runCommand(["mix", "compile"], { cwd: distPath, env })) !== 0) return null
  if ((await runCommand(["mix", "elixir_ls.release2", "-o", "release"], { cwd: distPath, env })) !== 0) return null

  await makeExecutableIfExists(script)
  return (await exists(script)) ? script : null
}

async function downloadLuaLs() {
  if (disableDownloads) return null

  const release = await githubRelease("https://api.github.com/repos/LuaLS/lua-language-server/releases/latest")
  if (!release?.tag_name) return null

  const platform = process.platform === "win32" ? "win32" : process.platform
  const arch = process.arch === "ia32" ? "ia32" : process.arch === "arm64" ? "arm64" : "x64"
  const ext = process.platform === "win32" ? "zip" : "tar.gz"
  const name = `lua-language-server-${release.tag_name}-${platform}-${arch}.${ext}`
  const asset = release.assets?.find((item) => item.name === name)
  if (!asset?.browser_download_url) return null

  const archive = await downloadAsset(asset.browser_download_url, name)
  if (!archive) return null

  const installDir = path.join(toolRoot, `lua-language-server-${arch}-${platform}`)
  await rm(installDir, { force: true, recursive: true })
  await mkdir(installDir, { recursive: true })
  await extractArchive(archive, installDir)
  await rm(archive, { force: true })

  const bin = path.join(installDir, "bin", executableName("lua-language-server"))
  return (await makeExecutableIfExists(bin)) ? bin : null
}

async function downloadTerraformLs() {
  if (disableDownloads) return null

  const response = await fetch("https://api.releases.hashicorp.com/v1/releases/terraform-ls/latest")
  if (!response.ok) return null

  const release = (await response.json()) as HashiCorpRelease
  const arch = process.arch === "arm64" ? "arm64" : "amd64"
  const os = process.platform === "win32" ? "windows" : process.platform
  const build = release.builds?.find((item) => item.arch === arch && item.os === os)
  if (!build?.url) return null

  const archive = await downloadAsset(build.url, "terraform-ls.zip")
  if (!archive) return null

  await extractArchive(archive, toolRoot)
  await rm(archive, { force: true })

  const bin = path.join(toolRoot, executableName("terraform-ls"))
  return (await makeExecutableIfExists(bin)) ? bin : null
}

async function downloadTexlab() {
  return downloadSingleBinaryGithubRelease({
    assetName: `texlab-${releaseArch("aarch64", "x86_64")}-${platformToken({
      darwin: "macos",
      linux: "linux",
      win32: "windows",
    })}.${archiveExtension("zip", "tar.gz")}`,
    binaryName: "texlab",
    url: "https://api.github.com/repos/latex-lsp/texlab/releases/latest",
  })
}

async function downloadTinymist() {
  return downloadSingleBinaryGithubRelease({
    assetName: `tinymist-${releaseArch("aarch64", "x86_64")}-${platformToken({
      darwin: "apple-darwin",
      linux: "unknown-linux-gnu",
      win32: "pc-windows-msvc",
    })}.${archiveExtension("zip", "tar.gz")}`,
    binaryName: "tinymist",
    extractArgs: process.platform === "win32" ? undefined : ["--strip-components=1"],
    url: "https://api.github.com/repos/Myriad-Dreamin/tinymist/releases/latest",
  })
}

async function downloadZls() {
  return downloadSingleBinaryGithubRelease({
    assetName: `zls-${releaseArch("aarch64", "x86_64")}-${platformToken({
      darwin: "macos",
      linux: "linux",
      win32: "windows",
    })}.${archiveExtension("zip", "tar.xz")}`,
    binaryName: "zls",
    url: "https://api.github.com/repos/zigtools/zls/releases/latest",
  })
}

async function downloadSingleBinaryGithubRelease(input: {
  readonly assetName: string
  readonly binaryName: string
  readonly extractArgs?: readonly string[]
  readonly url: string
}) {
  if (disableDownloads) return null

  const release = await githubRelease(input.url)
  const asset = release?.assets?.find((item) => item.name === input.assetName)
  if (!asset?.browser_download_url || !asset.name) return null

  const archive = await downloadAsset(asset.browser_download_url, asset.name)
  if (!archive) return null

  await extractArchive(archive, toolRoot, input.extractArgs)
  await rm(archive, { force: true })

  const bin = path.join(toolRoot, executableName(input.binaryName))
  return (await makeExecutableIfExists(bin)) ? bin : null
}

async function kotlinLauncher() {
  const distPath = path.join(toolRoot, "kotlin-ls")
  const launcher = path.join(distPath, process.platform === "win32" ? "kotlin-lsp.cmd" : "kotlin-lsp.sh")
  if (await exists(launcher)) return launcher
  if (disableDownloads) return null

  const release = await githubRelease("https://api.github.com/repos/Kotlin/kotlin-lsp/releases/latest")
  const version = release?.name?.replace(/^v/u, "")
  if (!version) return null

  const arch = process.arch === "arm64" ? "aarch64" : "x64"
  const platform = platformToken({ darwin: "mac", linux: "linux", win32: "win" })
  const name = `kotlin-lsp-${version}-${platform}-${arch}.zip`
  const url = `https://download-cdn.jetbrains.com/kotlin-lsp/${version}/${name}`
  const archive = await downloadAsset(url, name)
  if (!archive) return null

  await mkdir(distPath, { recursive: true })
  await extractArchive(archive, distPath)
  await rm(archive, { force: true })
  await makeExecutableIfExists(launcher)
  return (await exists(launcher)) ? launcher : null
}

async function jdtlsLauncher(distPath: string) {
  const launcherDir = path.join(distPath, "plugins")
  const entries = await readdir(launcherDir).catch(() => [])
  const jar = entries.find((item) => /^org\.eclipse\.equinox\.launcher_.*\.jar$/u.test(item))
  return jar ? path.join(launcherDir, jar) : null
}

function jdtlsConfigDirectory() {
  if (process.platform === "darwin") return "config_mac"
  if (process.platform === "win32") return "config_win"

  return "config_linux"
}

async function firstClangdInstall() {
  const direct = path.join(toolRoot, executableName("clangd"))
  if (await exists(direct)) return direct

  const entries = await readdir(toolRoot, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("clangd_")) continue

    const candidate = path.join(toolRoot, entry.name, "bin", executableName("clangd"))
    if (await exists(candidate)) return candidate
  }

  return null
}

async function githubRelease(url: string) {
  const response = await fetch(url)
  if (!response.ok) return null

  return (await response.json()) as GitHubAssetRelease
}

async function downloadAsset(url: string, name: string) {
  await mkdir(toolRoot, { recursive: true })
  const target = path.join(toolRoot, name)
  return (await downloadToFile(url, target)) ? target : null
}

async function downloadToFile(url: string, target: string) {
  const response = await fetch(url)
  if (!response.ok) return false

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength === 0) return false

  await writeFile(target, buffer)
  return true
}

async function extractArchive(archive: string, destination: string, extraArgs: readonly string[] = []) {
  await mkdir(destination, { recursive: true })
  if (archive.endsWith(".zip")) {
    await runCommand(["unzip", "-q", "-o", archive, "-d", destination], { cwd: destination })
    return
  }

  await runCommand(["tar", "-xf", archive, "-C", destination, ...extraArgs], { cwd: destination })
}

async function makeExecutableIfExists(filePath: string) {
  if (!(await exists(filePath))) return false
  if (process.platform !== "win32") await chmod(filePath, 0o755).catch(() => undefined)

  return true
}

async function commandHelpIncludes(binary: string, text: string) {
  const output = await commandOutput([binary, "--help"], { cwd: process.cwd() })
  return output?.includes(text) ?? false
}

async function commandOutput(command: readonly string[], options: CommandOptions) {
  const [binary, ...args] = command
  if (!binary) return null

  const proc = spawn(binary, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "ignore"],
  })
  const chunks: Buffer[] = []
  proc.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
  const exit = await waitForExit(proc)
  if (exit !== 0) return null

  return Buffer.concat(chunks).toString("utf8")
}

async function runCommand(command: readonly string[], options: CommandOptions) {
  const [binary, ...args] = command
  if (!binary) return 1

  await mkdir(toolRoot, { recursive: true })
  const proc = spawn(binary, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: "ignore",
  })
  return waitForExit(proc)
}

function waitForExit(process: ChildProcessWithoutNullStreams | ReturnType<typeof spawn>) {
  return new Promise<number>((resolve) => {
    process.once("error", () => resolve(1))
    process.once("exit", (code) => resolve(code ?? 1))
  })
}

function serverMatches(
  server: LspServerDefinition,
  extension: string,
  serverId: string | null | undefined
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

function which(command: string, extraPaths: readonly string[] = []) {
  const paths = [...extraPaths, ...(process.env.PATH?.split(path.delimiter) ?? [])]
  const names = commandNames(command)

  for (const directory of paths) {
    const found = firstExecutable(directory, names)
    if (found) return found
  }

  return null
}

function firstExecutable(directory: string, names: readonly string[]) {
  for (const name of names) {
    const candidate = path.join(directory, name)
    if (!existsSyncExecutable(candidate)) continue

    return candidate
  }

  return null
}

function commandNames(command: string) {
  if (process.platform !== "win32") return [command]
  if (/\.(cmd|bat|exe)$/iu.test(command)) return [command]

  return [command, `${command}.cmd`, `${command}.bat`, `${command}.exe`]
}

function existsSyncExecutable(candidate: string) {
  try {
    accessSync(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
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
  return [process.env.VIRTUAL_ENV, path.join(root, ".venv"), path.join(root, "venv")].filter(
    (item): item is string => Boolean(item)
  )
}

function isInsideOrEqual(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  if (relative === "") return true
  if (relative.startsWith("..")) return false

  return !path.isAbsolute(relative)
}

function globMarkerRegex(marker: string) {
  const escaped = marker.replace(/[.+?^${}()|[\]\\]/gu, "\\$&")
  return new RegExp(`^${escaped.replaceAll("\\*", ".*")}$`, "u")
}

function executableName(command: string) {
  return process.platform === "win32" ? `${command}.exe` : command
}

function releaseArch(arm64: string, x64: string) {
  return process.arch === "arm64" ? arm64 : x64
}

function platformToken(tokens: { readonly darwin: string; readonly linux: string; readonly win32: string }) {
  if (process.platform === "darwin") return tokens.darwin
  if (process.platform === "win32") return tokens.win32

  return tokens.linux
}

function archiveExtension(windows: string, other: string) {
  return process.platform === "win32" ? windows : other
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === "string")

  return strings.length === value.length ? strings : undefined
}

function stringRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined

  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "string") return undefined

    result[key] = item
  }

  return result
}

function unknownRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined

  return value as Record<string, unknown>
}

function truthy(value: string | undefined) {
  if (!value) return false

  return ["1", "true", "yes", "on"].includes(value.toLowerCase())
}
