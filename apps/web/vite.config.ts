import { existsSync, realpathSync } from "node:fs"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { consumeAppSave } from "../server/src/fs/app-save-marker"

const workspaceRoot = path.resolve(__dirname, "../..")
const editorSourceRoot = resolveEditorSourceRoot(workspaceRoot)

export default defineConfig({
  plugins: [
    platformSelfSaveHmrPlugin(),
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    exclude: ["@pierre/trees", "@pierre/trees/react"],
  },
  server: {
    fs: {
      allow: uniquePaths([workspaceRoot, editorSourceRoot]),
    },
  },
  worker: {
    format: "es",
  },
})

function platformSelfSaveHmrPlugin(): Plugin {
  return {
    name: "platform-self-save-hmr",
    apply: "serve",
    hotUpdate: {
      order: "pre",
      handler({ file }) {
        if (!consumeAppSave(file)) return

        return []
      },
    },
  }
}

function resolveEditorSourceRoot(root: string) {
  const envRoot = process.env.EDITOR_SOURCE_ROOT
  if (envRoot) return path.resolve(envRoot)

  const linkedPackageSource = realpathIfExists(
    path.join(root, "packages/editor-core/src")
  )
  if (!linkedPackageSource) return null

  return path.resolve(linkedPackageSource, "../../..")
}

function realpathIfExists(input: string) {
  return existsSync(input) ? realpathSync(input) : null
}

function uniquePaths(paths: Array<string | null>) {
  return Array.from(new Set(paths.filter(isString)))
}

function isString(value: string | null): value is string {
  return typeof value === "string"
}
