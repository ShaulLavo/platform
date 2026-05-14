import {
  createMergeConflictPlugin,
  type EditorHighlighterProvider,
  type EditorPlugin,
} from "@editor/core";
import { createEditorFindPlugin } from "@editor/find";
import { createFoldGutterPlugin, createLineGutterPlugin } from "@editor/gutters";
import type { FoldGutterIconContext } from "@editor/gutters";
import { loadShikiTheme } from "@editor/core/shiki";
import { CaretDownIcon } from "@phosphor-icons/react/ssr";
import { css, html, javaScript, json, markdown, typeScript } from "@editor/tree-sitter-languages";
import type { TypeScriptLspPlugin } from "@editor/typescript-lsp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { reportError, toClientError } from "@/lib/client-error-taxonomy";

const FOLD_CHEVRON_ICON_MARKUP = renderToStaticMarkup(
  createElement(CaretDownIcon, {
    className: "app-fold-chevron",
    size: 12,
    weight: "bold",
  }),
);

export function createCriticalEditorPlugins(
  typeScriptLsp: TypeScriptLspPlugin,
  shikiTheme: string | (() => string),
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
  ];
}

export async function loadNonCriticalEditorPlugins(): Promise<readonly EditorPlugin[]> {
  const plugins = await Promise.all([
    loadPlugin("@editor/scope-lines", () =>
      import("@editor/scope-lines").then((module) => module.createScopeLinesPlugin()),
    ),
    loadPlugin("@editor/minimap", () =>
      import("@editor/minimap").then((module) => module.createMinimapPlugin()),
    ),
  ]);

  return plugins.filter((plugin): plugin is EditorPlugin => plugin !== null);
}

export function createEditorPlugins(
  typeScriptLsp: TypeScriptLspPlugin,
  shikiTheme: string | (() => string),
): readonly EditorPlugin[] {
  return createCriticalEditorPlugins(typeScriptLsp, shikiTheme);
}

export function createEditorSyntaxHighlightingPlugins(
  shikiTheme: string | (() => string),
): readonly EditorPlugin[] {
  return [
    javaScript({ jsx: true }),
    typeScript({ tsx: true }),
    html(),
    css(),
    json(),
    markdown(),
    createShikiThemePlugin(shikiTheme),
  ];
}

function createShikiThemePlugin(shikiTheme: string | (() => string)): EditorPlugin {
  const provider = createShikiThemeProvider(shikiTheme);

  return {
    name: "shiki-theme",
    activate: (context) => context.registerHighlighter(provider),
  };
}

function createShikiThemeProvider(shikiTheme: string | (() => string)): EditorHighlighterProvider {
  return {
    // Load Shiki colors without creating a Shiki token session.
    createSession: () => null,
    loadTheme: () =>
      loadShikiTheme({
        theme: resolveShikiTheme(shikiTheme),
        themes: SHIKI_PRELOAD_THEMES,
      }),
  };
}

function resolveShikiTheme(shikiTheme: string | (() => string)): string {
  if (typeof shikiTheme === "function") return shikiTheme();
  return shikiTheme;
}

async function loadPlugin(
  name: string,
  load: () => Promise<EditorPlugin>,
): Promise<EditorPlugin | null> {
  try {
    return await load();
  } catch (error) {
    reportError(toClientError({ code: "OPERATION_FAILED", name, error }));
    return null;
  }
}

function createFoldChevronIcon({ document }: FoldGutterIconContext): SVGSVGElement {
  const template = document.createElement("template");
  template.innerHTML = FOLD_CHEVRON_ICON_MARKUP;
  return template.content.firstElementChild as SVGSVGElement;
}

const SHIKI_PRELOAD_THEMES = ["github-dark", "github-light"] as const;
