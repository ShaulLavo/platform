import {
  createEditorLoggingPlugin,
  createMergeConflictPlugin,
  type EditorDisposable,
  type EditorLogEvent,
  type EditorPlugin,
  type EditorScrollPosition,
  type EditorSyntaxProvider,
} from '@singapor/core'
import { createEditorFindPlugin } from '@singapor/find'
import { createFoldGutterPlugin, createLineGutterPlugin } from '@singapor/gutters'
import type { FoldGutterIconContext } from '@singapor/gutters'
import { CaretDownIcon } from '@phosphor-icons/react/ssr'
import {
  createTreeSitterSyntaxProvider,
  createTreeSitterWorkerBackend,
  type TreeSitterBackend,
} from '@singapor/tree-sitter'
import {
  TREE_SITTER_LANGUAGE_CONTRIBUTIONS,
  css,
  html,
  javaScript,
  json,
  markdown,
  typeScript,
} from '@singapor/tree-sitter-languages'
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
let treeSitterSyntaxBackend: TreeSitterBackend | null = null
const editorScrollPositionsByInstanceId = new Map<string, EditorScrollPosition>()
const ignoredEditorInfoActions = new Set([
  'editor.plugins.gutters.changed',
  'editor.syntax.document_started',
])
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

function loadNonCriticalEditorPlugins(): Promise<readonly EditorPlugin[]> {
  if (nonCriticalEditorPlugins) return Promise.resolve(nonCriticalEditorPlugins)
  if (nonCriticalEditorPluginsPromise) return nonCriticalEditorPluginsPromise

  nonCriticalEditorPluginsPromise = Promise.all(nonCriticalEditorPluginLoaders()).then(
    (plugins) => {
      nonCriticalEditorPlugins = plugins.filter((plugin): plugin is EditorPlugin => plugin !== null)
      return nonCriticalEditorPlugins
    },
  )

  return nonCriticalEditorPluginsPromise
}

function nonCriticalEditorPluginLoaders(): readonly Promise<EditorPlugin | null>[] {
  const loaders: Promise<EditorPlugin | null>[] = []
  if (!editorPerformanceFeatureDisabled('scope-lines')) {
    loaders.push(
      loadPlugin('@singapor/scope-lines', () =>
        import('@singapor/scope-lines').then((module) => module.createScopeLinesPlugin()),
      ),
    )
  }
  if (!editorPerformanceFeatureDisabled('minimap')) {
    loaders.push(
      loadPlugin('@singapor/minimap', () =>
        import('@singapor/minimap').then((module) => module.createMinimapPlugin()),
      ),
    )
  }

  // File-open "writes itself" animation. Presence is the switch — remove this
  // loader to turn it off. `mode`: 'autoregressive' (typewriter) | 'parallel'.
  loaders.push(
    loadPlugin('@singapor/decode', () =>
      import('@singapor/decode').then((module) =>
        module.createDecodePlugin({ mode: 'autoregressive' }),
      ),
    ),
  )

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

function createEditorSyntaxHighlightingPlugins(
  _options: EditorSyntaxHighlightingOptions = {},
): readonly EditorPlugin[] {
  void _options

  if (editorPerformanceFeatureDisabled('syntax')) return []

  return [javaScript({ jsx: true }), typeScript({ tsx: true }), html(), css(), json(), markdown()]
}

export function editorTreeSitterSyntaxProvider(): EditorSyntaxProvider {
  if (treeSitterSyntaxProvider) return treeSitterSyntaxProvider

  const backend = createTreeSitterWorkerBackend()
  const provider = createTreeSitterSyntaxProvider({ backend })
  for (const contribution of TREE_SITTER_LANGUAGE_CONTRIBUTIONS) {
    provider.registerLanguage(contribution, { replace: true })
  }

  treeSitterSyntaxBackend = backend
  treeSitterSyntaxProvider = provider
  return provider
}

export async function disposeEditorTreeSitterSyntaxProvider() {
  const backend = treeSitterSyntaxBackend
  treeSitterSyntaxBackend = null
  treeSitterSyntaxProvider = null
  await backend?.dispose?.()
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

function createPlatformEditorConsoleLoggingPlugin(): EditorPlugin {
  return PLATFORM_EDITOR_CONSOLE_LOGGING_PLUGIN
}

export function createPlatformSearchResultEditorLoggingPlugin(): EditorPlugin {
  return PLATFORM_SEARCH_RESULT_EDITOR_LOGGING_PLUGIN
}

function logEditorEventToConsole(event: EditorLogEvent): void {
  cacheEditorScrollPosition(event)
  if (event.action === 'editor.viewport.changed') return
  if (!shouldLogEditorEvent(event)) {
    forgetEditorScrollPosition(event)
    return
  }

  log[editorLogLevel(event)]({
    ...editorEventScrollContext(event),
    ...event,
    area: 'editor',
  })
  forgetEditorScrollPosition(event)
}

function shouldLogEditorEvent(event: EditorLogEvent): boolean {
  if (editorLogLevel(event) !== 'info') return true
  if (ignoredEditorInfoActions.has(event.action)) return false

  return !isShortEmptyEditorLifecycleSummary(event)
}

function isShortEmptyEditorLifecycleSummary(event: EditorLogEvent): boolean {
  if (event.action !== 'editor.lifecycle.summary') return false
  if (numberAtEventRecord(event, 'lifecycle', 'mountDurationMs') >= 100) return false
  if (numberAtEventRecord(event, 'document', 'openedCount') > 0) return false
  if (numberAtEventRecord(event, 'document', 'setTextCount') > 0) return false

  return numberAtEventRecord(event, 'document', 'syncedTextCount') === 0
}

function editorLogLevel(event: EditorLogEvent) {
  if (event.level === 'warn' || event.level === 'error') return event.level

  return 'info'
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

function numberAtEventRecord(event: EditorLogEvent, parentKey: string, key: string) {
  const parent = (event as Record<string, unknown>)[parentKey]
  if (!parent || typeof parent !== 'object') return 0

  const value = (parent as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
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
