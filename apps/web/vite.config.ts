import fs from 'node:fs'
import path from 'node:path'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { consumeAppSave } from '../server/src/fs/app-save-marker'

const EDITOR_SCOPE = '@singapor/'
const EDITOR_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '/index.ts', '/index.tsx'] as const
type EditorSourceModules = Map<string, Map<string, string>>

const workspaceRoot = path.resolve(__dirname, '../..')
const tilingSourceRoot = path.resolve(workspaceRoot, 'packages/tiling/src')
const editorPackagesRoot = path.resolve(workspaceRoot, 'node_modules/@singapor')
const editorSourceModules = buildEditorSourceModules(editorPackagesRoot)
const editorRepoRoots = collectEditorRepoRoots(editorPackagesRoot, editorSourceModules)

export default defineConfig({
  define: {
    'import.meta.env.OBSERVABILITY_ENABLED': JSON.stringify(
      process.env.OBSERVABILITY_ENABLED ?? '',
    ),
  },
  optimizeDeps: {
    exclude: ['ghostty-web'],
  },
  plugins: [
    editorSourcePlugin(editorSourceModules),
    platformSelfSaveHmrPlugin(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@workspace/tiling': tilingSourceRoot,
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    fs: {
      allow: uniquePaths([workspaceRoot, resolveEditorSourceRoot(), ...editorRepoRoots]),
    },
  },
  worker: {
    format: 'es',
  },
})

function platformSelfSaveHmrPlugin(): Plugin {
  return {
    name: 'platform-self-save-hmr',
    apply: 'serve',
    hotUpdate: {
      order: 'pre',
      handler({ file }) {
        if (!consumeAppSave(file)) return

        return []
      },
    },
  }
}

// In dev, resolve every `@singapor/*` import (bare entry and subpaths alike) to the
// editor's TypeScript source instead of its prebuilt `dist/`, so edits in the linked
// editor repo are live — the same "served from source" behavior as `@workspace/tiling`.
// A plain alias cannot do this: the packages remap subpaths non-literally in `exports`
// (`./document` -> `dist/public/document.js`, `./completion-controller` ->
// `completionController.js`), so we derive each source target from the package's own
// `exports` map. Resolution is all-or-nothing per package to avoid serving one entry
// from `src` and another from `dist` (which would duplicate stateful packages like core).
function editorSourcePlugin(modules: EditorSourceModules): Plugin {
  return {
    name: 'platform-editor-source',
    apply: 'serve',
    enforce: 'pre',
    resolveId(id) {
      return resolveEditorSourceId(modules, id)
    },
  }
}

function resolveEditorSourceId(modules: EditorSourceModules, id: string): string | null {
  if (!id.startsWith(EDITOR_SCOPE)) return null

  const { pkg, subpath } = parseEditorSpecifier(id)
  const entries = modules.get(pkg)
  if (!entries) return null

  return entries.get(subpath) ?? null
}

function parseEditorSpecifier(id: string): { pkg: string; subpath: string } {
  const rest = id.slice(EDITOR_SCOPE.length)
  const slash = rest.indexOf('/')
  if (slash === -1) return { pkg: rest, subpath: '.' }

  return { pkg: rest.slice(0, slash), subpath: `./${rest.slice(slash + 1)}` }
}

function buildEditorSourceModules(root: string): EditorSourceModules {
  const modules: EditorSourceModules = new Map()
  for (const name of editorPackageNames(root)) {
    const entries = editorPackageSourceEntries(path.join(root, name))
    if (entries) modules.set(name, entries)
  }
  return modules
}

function editorPackageNames(root: string): readonly string[] {
  if (!fs.existsSync(root)) return []

  return fs.readdirSync(root).filter((name) => fs.existsSync(path.join(root, name, 'package.json')))
}

function editorPackageSourceEntries(pkgDir: string): Map<string, string> | null {
  const exportEntries = readPackageExports(pkgDir)
  if (!exportEntries) return null

  const entries = new Map<string, string>()
  for (const [key, distTarget] of exportEntries) {
    const sourcePath = editorSourcePath(pkgDir, distTarget)
    if (!sourcePath) return null

    entries.set(key, sourcePath)
  }
  return entries
}

function readPackageExports(pkgDir: string): readonly (readonly [string, string])[] | null {
  const manifest = readJson(path.join(pkgDir, 'package.json'))
  const exportsField = manifest?.exports
  if (!exportsField || typeof exportsField !== 'object') return null

  const out: [string, string][] = []
  for (const [key, value] of Object.entries(exportsField)) {
    const target = exportTarget(value)
    if (target) out.push([key, target])
  }
  return out
}

function exportTarget(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  for (const condition of ['import', 'default', 'types']) {
    const candidate = record[condition]
    if (typeof candidate === 'string') return candidate
  }
  return null
}

function editorSourcePath(pkgDir: string, distTarget: string): string | null {
  if (!distTarget.includes('/dist/')) return null

  const sourceTarget = distTarget.replace('/dist/', '/src/')
  if (!sourceTarget.endsWith('.js')) return existingRealPath(path.join(pkgDir, sourceTarget))

  const base = path.join(pkgDir, sourceTarget.slice(0, -'.js'.length))
  return firstExistingRealPath(base, EDITOR_SOURCE_EXTENSIONS)
}

function firstExistingRealPath(base: string, extensions: readonly string[]): string | null {
  for (const ext of extensions) {
    const real = existingRealPath(base + ext)
    if (real) return real
  }
  return null
}

function existingRealPath(candidate: string): string | null {
  if (!fs.existsSync(candidate)) return null

  return fs.realpathSync(candidate)
}

function collectEditorRepoRoots(root: string, modules: EditorSourceModules): readonly string[] {
  const roots = new Set<string>()
  for (const name of modules.keys()) {
    const real = existingRealPath(path.join(root, name))
    if (!real) continue

    roots.add(path.resolve(real, '../..'))
  }
  return [...roots]
}

function readJson(file: string): Record<string, unknown> | null {
  if (!fs.existsSync(file)) return null

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function resolveEditorSourceRoot() {
  const envRoot = process.env.EDITOR_SOURCE_ROOT
  if (envRoot) return path.resolve(envRoot)

  return null
}

function uniquePaths(paths: Array<string | null>) {
  return Array.from(new Set(paths.filter(isString)))
}

function isString(value: string | null): value is string {
  return typeof value === 'string'
}
