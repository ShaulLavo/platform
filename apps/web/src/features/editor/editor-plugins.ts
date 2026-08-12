import {
  createBracketMatchPlugin,
  createDocumentLinkPlugin,
  createEditorLoggingPlugin,
  createMergeConflictPlugin,
  createOccurrenceHighlightPlugin,
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
  createShikiHighlighterPlugin,
  createShikiWorkerOwner,
  type ShikiWorkerOwner,
} from '@singapor/core/shiki'
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
import {
  activeEditorThemeUsesShiki,
  activeShikiThemeId,
  getLoadedVscodeThemeRegistration,
  subscribeEditorColorTheme,
} from '@/features/editor/state/editor-color-theme-store'
import { requestedDecodeMode } from '@/features/editor/utils/decode-mode'
import {
  EDITOR_SHIKI_LANGUAGE_MAP,
  EDITOR_SHIKI_PRELOAD_LANGUAGES,
  EDITOR_SHIKI_PRELOAD_THEMES,
} from '@/features/editor/utils/shiki-languages'
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
let shikiWorkerOwner: ShikiWorkerOwner | null = null
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

export function createCriticalEditorCorePlugins(): readonly EditorPlugin[] {
  return [
    ...createEditorSyntaxHighlightingPlugins(),
    createLineGutterPlugin(),
    createFoldGutterPlugin({
      width: 16,
      icon: createFoldChevronIcon,
      iconClassName: 'app-fold-gutter-icon',
    }),
    createEditorFindPlugin(),
    createMergeConflictPlugin(),
    createBracketMatchPlugin({
      style: { backgroundColor: 'var(--editor-bracket-match-background)' },
    }),
    createOccurrenceHighlightPlugin({
      style: { backgroundColor: 'var(--editor-occurrence-highlight-background)' },
    }),
    createDocumentLinkPlugin(),
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

  // File-open "writes itself" animation. Off unless the URL asks for it, e.g.
  // `?decode=diffusion` (denoise into the file) | 'autoregressive' (typewriter) |
  // 'parallel' | 'token' (one LLM-style token at a time).
  const decodeMode = requestedDecodeMode(typeof window === 'undefined' ? '' : location.search)
  if (decodeMode) {
    loaders.push(
      loadPlugin('@singapor/decode', () =>
        import('@singapor/decode').then((module) =>
          module.createDecodePlugin({ mode: decodeMode }),
        ),
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

function createEditorSyntaxHighlightingPlugins(): readonly EditorPlugin[] {
  if (editorPerformanceFeatureDisabled('syntax')) return []

  return [
    // Tree-sitter stays for structure (folds/brackets); its token output is
    // suppressed automatically once the shiki highlighter session exists.
    javaScript({ jsx: true }),
    typeScript({ tsx: true }),
    html(),
    css(),
    json(),
    markdown(),
    createEditorShikiHighlighterPlugin(),
  ]
}

/**
 * The theme name the shiki worker is asked for, logged at the point of decision.
 * Nothing downstream reports which theme a highlighter session was built with, so
 * without this a theme swap that fails to repaint is indistinguishable from one
 * that never reached the worker.
 */
function resolveShikiThemeForSession(): string {
  const themeId = activeShikiThemeId()
  log.debug({
    action: 'editor.color-theme.shiki_resolved',
    area: 'editor',
    hasRegistration: Boolean(getLoadedVscodeThemeRegistration(themeId)),
    themeId,
  })

  return themeId
}

/**
 * The shiki highlighter, registered only while the selected theme is one shiki
 * can paint. The built-in themes color tree-sitter's captures instead, and
 * tree-sitter emits highlights only when no highlighter session exists — so a
 * built-in selection has to take the provider off the editor, not just hand it
 * different colors. Deregistering reloads every open document's highlighter,
 * which is exactly the repaint the swap needs.
 */
function createEditorShikiHighlighterPlugin(): EditorPlugin {
  const shiki = createShikiHighlighterPlugin({
    languages: EDITOR_SHIKI_LANGUAGE_MAP,
    onThemeChanged: (listener) => subscribeEditorColorTheme(listener),
    preloadLanguages: EDITOR_SHIKI_PRELOAD_LANGUAGES,
    preloadThemes: EDITOR_SHIKI_PRELOAD_THEMES,
    theme: () => resolveShikiThemeForSession(),
    // The worker can resolve only ~20 themes by name; the rest need a real
    // registration object handed over synchronously at session creation.
    themeRegistration: () => getLoadedVscodeThemeRegistration(activeShikiThemeId()),
    workerOwner: editorShikiWorkerOwner(),
  })

  return {
    name: 'platform.shiki-highlighter',
    activate: (context) => {
      let activation: EditorDisposable | null = null

      const syncActivation = () => {
        const wanted = activeEditorThemeUsesShiki()
        if (wanted === (activation !== null)) return
        if (!wanted) {
          activation?.dispose()
          activation = null
          return
        }

        activation = disposableFromActivationResult(shiki.activate(context))
      }

      syncActivation()
      const unsubscribe = subscribeEditorColorTheme(syncActivation)

      return {
        dispose: () => {
          unsubscribe()
          activation?.dispose()
          activation = null
        },
      }
    },
  }
}

export function editorShikiWorkerOwner(): ShikiWorkerOwner {
  if (shikiWorkerOwner) return shikiWorkerOwner

  shikiWorkerOwner = createShikiWorkerOwner()
  return shikiWorkerOwner
}

export async function disposeEditorShikiWorkerOwner() {
  const owner = shikiWorkerOwner
  shikiWorkerOwner = null
  await owner?.dispose?.()
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
