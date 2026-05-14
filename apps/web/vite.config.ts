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
    disableReactDevtoolsInProductionPlugin(),
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

const DISABLE_REACT_DEVTOOLS_SCRIPT = `
;(() => {
  let hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__

  const disabledHook = (nextHook) => {
    if (!nextHook || typeof nextHook !== "object") {
      return { isDisabled: true }
    }

    nextHook.isDisabled = true
    return nextHook
  }

  try {
    Object.defineProperty(globalThis, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
      configurable: true,
      get() {
        return hook
      },
      set(nextHook) {
        hook = disabledHook(nextHook)
      },
    })
    hook = disabledHook(hook)
  } catch {
    hook = disabledHook(hook)
    globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook
  }
})()
`.trim()

function disableReactDevtoolsInProductionPlugin(): Plugin {
  return {
    name: "platform-disable-react-devtools-production",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "script",
          children: DISABLE_REACT_DEVTOOLS_SCRIPT,
          injectTo: "head-prepend",
        },
      ]
    },
  }
}

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
