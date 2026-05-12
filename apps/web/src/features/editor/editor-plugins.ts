import { createMergeConflictPlugin, type EditorPlugin } from "@editor/core"
import { createEditorFindPlugin } from "@editor/find"
import { createFoldGutterPlugin, createLineGutterPlugin } from "@editor/gutters"
import type { FoldGutterIconContext } from "@editor/gutters"
import { createShikiHighlighterPlugin } from "@editor/core/shiki"
import {
  css,
  html,
  javaScript,
  json,
  markdown,
  typeScript,
} from "@editor/tree-sitter-languages"
import type { TypeScriptLspPlugin } from "@editor/typescript-lsp"
import { reportError, toClientError } from "@/lib/client-error-taxonomy"

const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const FOLD_CHEVRON_PATH =
  "M297.4 438.6C309.9 451.1 330.2 451.1 342.7 438.6L502.7 278.6C515.2 266.1 515.2 245.8 502.7 233.3C490.2 220.8 469.9 220.8 457.4 233.3L320 370.7L182.6 233.4C170.1 220.9 149.8 220.9 137.3 233.4C124.8 245.9 124.8 266.2 137.3 278.7L297.3 438.7z"

export function createCriticalEditorPlugins(
  typeScriptLsp: TypeScriptLspPlugin,
  shikiTheme: string | (() => string)
): readonly EditorPlugin[] {
  return [
    ...createEditorSyntaxHighlightingPlugins(shikiTheme),
    createLineGutterPlugin(),
    createFoldGutterPlugin({
      width: 16,
      icon: createFoldChevronIcon,
      iconClassName: "app-fold-gutter-icon",
    }),
    createEditorFindPlugin(),
    createMergeConflictPlugin(),
    typeScriptLsp,
  ]
}

export async function loadNonCriticalEditorPlugins(): Promise<
  readonly EditorPlugin[]
> {
  const plugins = await Promise.all([
    loadPlugin("@editor/scope-lines", () =>
      import("@editor/scope-lines").then((module) =>
        module.createScopeLinesPlugin()
      )
    ),
    loadPlugin("@editor/minimap", () =>
      import("@editor/minimap").then((module) => module.createMinimapPlugin())
    ),
  ])

  return plugins.filter((plugin): plugin is EditorPlugin => plugin !== null)
}

export function createEditorPlugins(
  typeScriptLsp: TypeScriptLspPlugin,
  shikiTheme: string | (() => string)
): readonly EditorPlugin[] {
  return createCriticalEditorPlugins(typeScriptLsp, shikiTheme)
}

export function createEditorSyntaxHighlightingPlugins(
  shikiTheme: string | (() => string)
): readonly EditorPlugin[] {
  return [
    javaScript({ jsx: true }),
    typeScript({ tsx: true }),
    html(),
    css(),
    json(),
    markdown(),
    createShikiHighlighterPlugin({
      theme: shikiTheme,
      preloadLanguages: SHIKI_PRELOAD_LANGUAGES,
      preloadThemes: SHIKI_PRELOAD_THEMES,
    }),
  ]
}

async function loadPlugin(
  name: string,
  load: () => Promise<EditorPlugin>
): Promise<EditorPlugin | null> {
  try {
    return await load()
  } catch (error) {
    reportError(toClientError({ code: "OPERATION_FAILED", name, error }))
    return null
  }
}

function createFoldChevronIcon({
  document,
}: FoldGutterIconContext): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, "svg")
  svg.classList.add("app-fold-chevron")
  svg.setAttribute("viewBox", "0 0 640 640")

  const path = document.createElementNS(SVG_NAMESPACE, "path")
  path.setAttribute("d", FOLD_CHEVRON_PATH)
  svg.append(path)
  return svg
}

const SHIKI_PRELOAD_LANGUAGES = [
  "css",
  "diff",
  "html",
  "javascript",
  "json",
  "markdown",
  "tsx",
  "typescript",
] as const

const SHIKI_PRELOAD_THEMES = ["github-dark", "github-light"] as const
