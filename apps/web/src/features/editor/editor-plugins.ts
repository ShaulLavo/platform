import {
  createEditorLoggingPlugin,
  createMergeConflictPlugin,
  type EditorLogEvent,
  type EditorPlugin,
  type EditorSyntaxProvider,
} from '@editor/core'
import type { DiffSyntaxBackend } from '@editor/diff'
import { createEditorFindPlugin } from '@editor/find'
import { createFoldGutterPlugin, createLineGutterPlugin } from '@editor/gutters'
import type { FoldGutterIconContext } from '@editor/gutters'
import { createTreeSitterSyntaxProvider } from '@editor/tree-sitter'
import { CaretDownIcon } from '@phosphor-icons/react/ssr'
import {
  TREE_SITTER_LANGUAGE_CONTRIBUTIONS,
  css,
  html,
  javaScript,
  json,
  markdown,
  typeScript,
} from '@editor/tree-sitter-languages'
import type { LanguageServerPlugin } from '@editor/language-server'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { logClientEvent } from '@/lib/client-logging'

const FOLD_CHEVRON_ICON_MARKUP = renderToStaticMarkup(
  createElement(CaretDownIcon, {
    className: 'app-fold-chevron',
    size: 12,
    weight: 'bold',
  }),
)

let treeSitterSyntaxProvider: EditorSyntaxProvider | null = null
const PLATFORM_EDITOR_CONSOLE_LOGGING_PLUGIN = createEditorLoggingPlugin(logEditorEventToConsole, {
  name: 'platform.editor-logging',
})

export type EditorSyntaxHighlightingOptions = {
  readonly highlighter?: 'tree-sitter'
}

export function createCriticalEditorPlugins(
  languageServer: LanguageServerPlugin,
  syntaxOptions: EditorSyntaxHighlightingOptions = {},
): readonly EditorPlugin[] {
  return createCriticalEditorCorePlugins(syntaxOptions).concat(languageServer)
}

export function createCriticalEditorCorePlugins(
  syntaxOptions: EditorSyntaxHighlightingOptions = {},
): readonly EditorPlugin[] {
  return [
    ...createEditorSyntaxHighlightingPlugins(syntaxOptions),
    createLineGutterPlugin(),
    createFoldGutterPlugin({
      width: 16,
      icon: createFoldChevronIcon,
      iconClassName: 'app-fold-gutter-icon',
    }),
    createEditorFindPlugin(),
    createMergeConflictPlugin(),
    createPlatformEditorConsoleLoggingPlugin(),
  ]
}

export async function loadNonCriticalEditorPlugins(): Promise<readonly EditorPlugin[]> {
  const plugins = await Promise.all([
    loadPlugin('@editor/scope-lines', () =>
      import('@editor/scope-lines').then((module) => module.createScopeLinesPlugin()),
    ),
    loadPlugin('@editor/minimap', () =>
      import('@editor/minimap').then((module) => module.createMinimapPlugin()),
    ),
  ])

  return plugins.filter((plugin): plugin is EditorPlugin => plugin !== null)
}

export function createEditorPlugins(
  languageServer: LanguageServerPlugin,
  syntaxOptions: EditorSyntaxHighlightingOptions = {},
): readonly EditorPlugin[] {
  return createCriticalEditorPlugins(languageServer, syntaxOptions)
}

export function createEditorSyntaxHighlightingPlugins(
  _options: EditorSyntaxHighlightingOptions = {},
): readonly EditorPlugin[] {
  void _options

  return [javaScript({ jsx: true }), typeScript({ tsx: true }), html(), css(), json(), markdown()]
}

export function createEditorDiffSyntaxBackend(
  _options: EditorSyntaxHighlightingOptions = {},
): DiffSyntaxBackend {
  void _options

  return {
    kind: 'tree-sitter',
    provider: editorTreeSitterSyntaxProvider(),
  }
}

function editorTreeSitterSyntaxProvider(): EditorSyntaxProvider {
  if (treeSitterSyntaxProvider) return treeSitterSyntaxProvider

  const provider = createTreeSitterSyntaxProvider()
  for (const contribution of TREE_SITTER_LANGUAGE_CONTRIBUTIONS) {
    provider.registerLanguage(contribution, { replace: true })
  }

  treeSitterSyntaxProvider = provider
  return provider
}

async function loadPlugin(
  name: string,
  load: () => Promise<EditorPlugin>,
): Promise<EditorPlugin | null> {
  try {
    return await load()
  } catch (error) {
    reportError(toClientError({ code: 'OPERATION_FAILED', name, error }))
    return null
  }
}

function createFoldChevronIcon({ document }: FoldGutterIconContext): SVGSVGElement {
  const template = document.createElement('template')
  template.innerHTML = FOLD_CHEVRON_ICON_MARKUP
  return template.content.firstElementChild as SVGSVGElement
}

export function createPlatformEditorConsoleLoggingPlugin(): EditorPlugin {
  return PLATFORM_EDITOR_CONSOLE_LOGGING_PLUGIN
}

function logEditorEventToConsole(event: EditorLogEvent): void {
  console.log('[editor]', event.action, event)
  logClientEvent({
    ...event,
    area: 'editor',
  })
}
