import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { consumeAppSave } from '../server/src/fs/app-save-marker'

const workspaceRoot = path.resolve(__dirname, '../..')
const editorSourceRoot = resolveEditorSourceRoot()
const tilingSourceRoot = path.resolve(workspaceRoot, 'packages/tiling/src')

export default defineConfig({
  define: {
    'import.meta.env.OBSERVABILITY_ENABLED': JSON.stringify(
      process.env.OBSERVABILITY_ENABLED ?? '',
    ),
  },
  optimizeDeps: {
    exclude: ['ghostty-web', '@singapor/tree-sitter-languages'],
  },
  plugins: [
    platformSelfSaveHmrPlugin(),
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
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
      allow: uniquePaths([workspaceRoot, editorSourceRoot]),
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
