import {
  createEditorLoggingPlugin,
  createMergeConflictPlugin,
  type EditorDisposable,
  type EditorLogEvent,
  type EditorPlugin,
  type EditorScrollPosition,
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
import type { LanguageServerPlugin } from '@editor/lsp-plugin'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { log } from '@/lib/client-logging'
import { editorPerformanceFeatureDisabled } from '@/lib/editor-performance-trace'

const FOLD_CHEVRON_ICON_MARKUP = renderToStaticMarkup(
  createElement(CaretDownIcon, {
    className: 'app-fold-chevron',
    size: 12,
    weight: 'bold',
  }),
)

let treeSitterSyntaxProvider: EditorSyntaxProvider | null = null
const editorScrollPositionsByInstanceId = new Map<string, EditorScrollPosition>()
const PLATFORM_EDITOR_CONSOLE_LOGGING_PLUGIN = createEditorLoggingPlugin(logEditorEventToConsole, {
  name: 'platform.editor-logging',
})
const PLATFORM_SEARCH_RESULT_EDITOR_LOGGING_PLUGIN = createEditorLoggingPlugin(
  logSearchResultEditorEventToConsole,
  {
    name: 'platform.search-result-editor-logging',
  },
)
let nonCriticalEditorPlugins: readonly EditorPlugin[] | null = null
let nonCriticalEditorPluginsPromise: Promise<readonly EditorPlugin[]> | null = null

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

export function createNonCriticalEditorPluginsLoaderPlugin(): EditorPlugin {
  return {
    name: 'platform.non-critical-editor-plugins',
    activate: (context) => {
      let disposed = false
      const disposables: EditorDisposable[] = []

      scheduleNonCriticalPluginLoad(async () => {
        const plugins = await loadNonCriticalEditorPlugins()
        if (disposed) return

        for (const plugin of plugins) {
          const disposable = activateLoadedEditorPlugin(plugin, context)
          if (disposable) disposables.push(disposable)
        }
      })

      return {
        dispose: () => {
          disposed = true
          disposeAll(disposables)
        },
      }
    },
  }
}

export function loadNonCriticalEditorPlugins(): Promise<readonly EditorPlugin[]> {
  if (nonCriticalEditorPlugins) return Promise.resolve(nonCriticalEditorPlugins)
  if (nonCriticalEditorPluginsPromise) return nonCriticalEditorPluginsPromise

  nonCriticalEditorPluginsPromise = Promise.all(nonCriticalEditorPluginLoaders()).then((plugins) => {
    nonCriticalEditorPlugins = plugins.filter((plugin): plugin is EditorPlugin => plugin !== null)
    return nonCriticalEditorPlugins
  })

  return nonCriticalEditorPluginsPromise
}

function nonCriticalEditorPluginLoaders(): readonly Promise<EditorPlugin | null>[] {
  const loaders: Promise<EditorPlugin | null>[] = []
  if (!editorPerformanceFeatureDisabled('scope-lines')) {
    loaders.push(
      loadPlugin('@editor/scope-lines', () =>
        import('@editor/scope-lines').then((module) => module.createScopeLinesPlugin()),
      ),
    )
  }
  if (!editorPerformanceFeatureDisabled('minimap')) {
    loaders.push(
      loadPlugin('@editor/minimap', () =>
        import('@editor/minimap').then((module) => module.createMinimapPlugin()),
      ),
    )
  }

  return loaders
}

function scheduleNonCriticalPluginLoad(load: () => void) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(load)
    return
  }

  queueMicrotask(load)
}

function activateLoadedEditorPlugin(
  plugin: EditorPlugin,
  context: Parameters<EditorPlugin['activate']>[0],
): EditorDisposable | null {
  try {
    return disposableFromActivationResult(plugin.activate(context))
  } catch (error) {
    reportError(
      toClientError({ code: 'OPERATION_FAILED', name: plugin.name ?? 'editor-plugin', error }),
    )
    return null
  }
}

function disposableFromActivationResult(
  result: ReturnType<EditorPlugin['activate']>,
): EditorDisposable | null {
  if (!result) return null
  if (!isEditorDisposableArray(result)) return result

  return {
    dispose: () => disposeAll(result),
  }
}

function isEditorDisposableArray(
  result: ReturnType<EditorPlugin['activate']>,
): result is readonly EditorDisposable[] {
  return Array.isArray(result)
}

function disposeAll(disposables: readonly EditorDisposable[]) {
  for (const disposable of disposables) disposable.dispose()
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

export function editorTreeSitterSyntaxProvider(): EditorSyntaxProvider {
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

export function createPlatformSearchResultEditorLoggingPlugin(): EditorPlugin {
  return PLATFORM_SEARCH_RESULT_EDITOR_LOGGING_PLUGIN
}

function logEditorEventToConsole(event: EditorLogEvent): void {
  cacheEditorScrollPosition(event)
  if (event.action === 'editor.viewport.changed') return

  log.info({
    ...editorEventScrollContext(event),
    ...event,
    area: 'editor',
  })
  forgetEditorScrollPosition(event)
}

function logSearchResultEditorEventToConsole(event: EditorLogEvent): void {
  if (event.level !== 'warn' && event.level !== 'error') return

  log[event.level]({
    ...event,
    area: 'editor',
    surface: 'search-result',
  })
}

function cacheEditorScrollPosition(event: EditorLogEvent): void {
  const instanceId = editorLogInstanceId(event)
  const scrollPosition = editorLogScrollPosition(event)
  if (!instanceId || !scrollPosition) return

  editorScrollPositionsByInstanceId.set(instanceId, scrollPosition)
}

function editorEventScrollContext(event: EditorLogEvent): Record<string, unknown> {
  const instanceId = editorLogInstanceId(event)
  if (!instanceId) return {}

  const scrollPosition = editorScrollPositionsByInstanceId.get(instanceId)
  if (!scrollPosition) return {}

  return { scrollPosition }
}

function forgetEditorScrollPosition(event: EditorLogEvent): void {
  if (event.action !== 'editor.lifecycle.disposing') return

  const instanceId = editorLogInstanceId(event)
  if (!instanceId) return

  editorScrollPositionsByInstanceId.delete(instanceId)
}

function editorLogInstanceId(event: EditorLogEvent): string | null {
  const instanceId = event.editor?.instanceId
  return typeof instanceId === 'string' ? instanceId : null
}

function editorLogScrollPosition(event: EditorLogEvent): EditorScrollPosition | null {
  const viewport = event.viewport
  if (!editorLogViewportHasScrollPosition(viewport)) return null

  return {
    left: viewport.scrollLeft,
    top: viewport.scrollTop,
  }
}

function editorLogViewportHasScrollPosition(
  viewport: unknown,
): viewport is { readonly scrollLeft: number; readonly scrollTop: number } {
  if (!viewport || typeof viewport !== 'object') return false

  return (
    typeof (viewport as Record<string, unknown>).scrollLeft === 'number' &&
    typeof (viewport as Record<string, unknown>).scrollTop === 'number'
  )
}
