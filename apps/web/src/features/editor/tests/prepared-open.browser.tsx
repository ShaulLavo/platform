import '@workspace/ui/globals.css'
import '@singapor/core/style.css'
import '@singapor/gutters/style.css'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useLayoutEffect } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { ForesightManager } from 'js.foresight'

import { TestEditorStateProvider as EditorStateProvider } from '../../../../test/factories/editor-state-provider'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { useEditorCommands, type EditorCommands } from '@/features/editor/state/commands'
import {
  resetEditorColorThemeStore,
  setSelectedEditorThemeId,
} from '@/features/editor/state/color-theme-store'
import {
  awaitEditorSyntaxWorkerIdleFences,
  disposeEditorShikiWorkerOwner,
  disposeEditorTreeSitterSyntaxProvider,
} from '@/features/editor/state/syntax-highlighting'
import {
  useEditorWorkspaceState,
  type EditorWorkspaceStore,
} from '@/features/editor/state/workspace-state'
import { EditorSurfaceTabBody } from '@/features/workbench/components/editor-surface-tab-body'
import { useEditorTabIntentPrefetch } from '@/features/workspace/hooks/use-tab-intent-prefetch'
import { createIntentPrefetchRegistry } from '@/features/workspace/utils/intent-prefetch-registry'
import { ensureFileSnapshotQuery, FILE_SNAPSHOT_STALE_MS } from '@/lib/file-snapshot-query-cache'
import { useFileOpenIntent } from '@/lib/file-open-intent/providers/context'
import type { FileOpenIntentService } from '@/lib/file-open-intent/state/service'
import { AppProviders, createTestQueryClient, seedBootMirrorTheme } from '../../../../test/render'

const PATH = 'repo/src/editor-tab-a.ts'
const ROOT_PATH = 'repo'
let root: Root | null = null
let runtime: PreparedOpenRuntime | null = null
let diagnostics: EditorDiagnostic[] = []

afterEach(async () => {
  if (root) flushSync(() => root?.unmount())
  root = null
  runtime = null
  diagnostics = []
  editorDiagnosticGlobal.__EDITOR_PERFORMANCE_DIAGNOSTICS__ = null
  editorDiagnosticGlobal.__editorPerfTrace = undefined
  await Promise.all([disposeEditorShikiWorkerOwner(), disposeEditorTreeSitterSyntaxProvider()])
  resetEditorColorThemeStore()
  document.body.replaceChildren()
  document.documentElement.classList.remove('dark', 'light')
  localStorage.clear()
  performance.clearMarks()
  performance.clearMeasures()
})

test(
  'promotes a real Foresight tab prediction in the first browser frame without duplicate work',
  { timeout: 30_000 },
  async () => {
    seedBootMirrorTheme('dark')
    resetEditorColorThemeStore()
    setSelectedEditorThemeId('dark', 'dark-plus')
    editorDiagnosticGlobal.__EDITOR_PERFORMANCE_DIAGNOSTICS__ = (diagnostic) => {
      diagnostics.push(diagnostic)
    }
    editorDiagnosticGlobal.__editorPerfTrace = { mark: () => undefined }
    const queryClient = createTestQueryClient()
    mountHarness(queryClient)
    await expect.poll(() => runtime).not.toBeNull()
    await expect.poll(activeThemeIdentity, { timeout: 10_000 }).toBe('dark-plus|dark-plus')
    const harness = requiredRuntime()

    flushSync(() => harness.commands.switchRootFolder(rootFolder()))
    await expect.poll(registeredForesightTarget).toMatchObject({
      meta: { path: PATH, rootPath: ROOT_PATH, tabId: 'prepared-open-browser-target' },
      name: expect.stringContaining('editor-tab:'),
    })
    performance.clearMarks('editor.worker.request')
    await triggerForesightIntent()
    await expect
      .poll(preparationRequestTypes, { timeout: 20_000 })
      .toEqual(expect.arrayContaining(['open', 'parse', 'queryRange']))
    await awaitEditorSyntaxWorkerIdleFences()
    await Promise.resolve()

    diagnostics = []
    performance.clearMarks('editor.worker.request')
    performance.clearMarks('editor.file_open.buffer_built')
    performance.clearMarks('editor.file_open.file_read')
    performance.clearMarks('editor.authoritative_text_paint')
    performance.clearMarks('editor.authoritative_highlight_paint')
    const firstFrame = await activateAndCaptureFirstFrame()

    expect(firstFrame.text).toContain("export const editorTabA = 'real browser fixture A'")
    expect(firstFrame.rowCount).toBeGreaterThan(0)
    await expect
      .poll(() => document.querySelector('.editor-virtualized')?.textContent, { timeout: 10_000 })
      .toContain("export const editorTabA = 'real browser fixture A'")
    await expect
      .poll(() => performance.getEntriesByName('editor.authoritative_highlight_paint').length)
      .toBe(1)

    expect(attachmentDiagnostic()?.detail).toMatchObject({
      highlighter: 'ready',
      prepared: true,
      structural: 'ready',
    })
    expect(postActivationStructuralDiagnostics()).toEqual([])
    expect(postActivationTransferRequestTypes()).toEqual([])
    expect(performance.getEntriesByName('editor.file_open.buffer_built')).toEqual([])
    expect(performance.getEntriesByName('editor.file_open.file_read')).toEqual([])
    expect(performance.getEntriesByName('editor.authoritative_text_paint')).toHaveLength(1)
  },
)

test(
  'installs a query-ready file before the first browser frame',
  { timeout: 30_000 },
  async () => {
    seedBootMirrorTheme('dark')
    resetEditorColorThemeStore()
    setSelectedEditorThemeId('dark', 'dark-plus')
    editorDiagnosticGlobal.__EDITOR_PERFORMANCE_DIAGNOSTICS__ = (diagnostic) => {
      diagnostics.push(diagnostic)
    }
    editorDiagnosticGlobal.__editorPerfTrace = { mark: () => undefined }
    const queryClient = createTestQueryClient()
    mountHarness(queryClient)
    await expect.poll(() => runtime).not.toBeNull()
    await expect.poll(activeThemeIdentity, { timeout: 10_000 }).toBe('dark-plus|dark-plus')
    const harness = requiredRuntime()

    flushSync(() => harness.commands.switchRootFolder(rootFolder()))
    await ensureFileSnapshotQuery(queryClient, PATH)
    diagnostics = []
    performance.clearMarks('editor.authoritative_text_paint')
    const firstFrame = await activateAndCaptureFirstFrame()

    expect(firstFrame.text).toContain("export const editorTabA = 'real browser fixture A'")
    expect(firstFrame.rowCount).toBeGreaterThan(0)
    await expect
      .poll(() => performance.getEntriesByName('editor.authoritative_text_paint').length)
      .toBe(1)
    expect(attachmentDiagnostic()?.detail).toMatchObject({ prepared: false })
  },
)

test('delivers an imperative row prediction through the real Foresight manager', async () => {
  const target = document.createElement('button')
  target.dataset.imperativeForesightTarget = ''
  target.style.height = '40px'
  target.style.left = '300px'
  target.style.position = 'fixed'
  target.style.top = '120px'
  target.style.width = '180px'
  document.body.append(target)
  const intents: string[] = []
  const registry = createIntentPrefetchRegistry({
    reactivateAfter: FILE_SNAPSHOT_STALE_MS,
    resolveRow: () => ({
      intent: '/repo/src/imperative.ts',
      key: '/repo/src/imperative.ts',
      meta: { treePath: 'src/imperative.ts' },
      name: 'file-tree:src/imperative.ts',
    }),
  })

  try {
    registry.sync([target], (intent) => intents.push(intent))
    expect(ForesightManager.instance.getManagerData.registeredElements.get(target)).toMatchObject({
      meta: { treePath: 'src/imperative.ts' },
      name: 'file-tree:src/imperative.ts',
    })

    await triggerForesightElement(target)
    await expect.poll(() => intents).toEqual(['/repo/src/imperative.ts'])
  } finally {
    registry.clear()
    target.remove()
  }
})

function mountHarness(queryClient: QueryClient): void {
  const host = document.createElement('main')
  host.dataset.workbench = ''
  host.style.height = '240px'
  host.style.position = 'relative'
  host.style.width = '640px'
  document.body.append(host)
  root = createRoot(host)
  flushSync(() => {
    root?.render(
      <AppProviders command={false} queryClient={queryClient}>
        <EditorStateProvider>
          <PreparedOpenHarness />
        </EditorStateProvider>
      </AppProviders>,
    )
  })
}

function PreparedOpenHarness() {
  const commands = useEditorCommands()
  const queryClient = useQueryClient()
  const { service: fileOpenIntent } = useFileOpenIntent()
  const activeTab = useEditorWorkspaceState(activeEditorTab)

  useLayoutEffect(() => {
    runtime = { commands, fileOpenIntent, queryClient }
    return () => {
      runtime = null
    }
  }, [commands, fileOpenIntent, queryClient])

  return (
    <>
      <ThemeIdentity />
      <IntentTarget />
      {activeTab ? (
        <EditorSurfaceTabBody
          active
          editorKeymapLayers={[]}
          path={activeTab.path}
          rootPath={ROOT_PATH}
          tabId={activeTab.id}
        />
      ) : null}
    </>
  )
}

function IntentTarget() {
  const commands = useEditorCommands()
  const elementRef = useEditorTabIntentPrefetch({
    active: false,
    id: 'prepared-open-browser-target',
    path: PATH,
  })

  return (
    <button
      data-prepared-open-target=''
      ref={elementRef}
      style={{ height: 40, left: 300, position: 'fixed', top: 120, width: 180 }}
      type='button'
      onClick={() => commands.openFileSurface(PATH)}
    >
      Open prepared fixture
    </button>
  )
}

function ThemeIdentity() {
  const { appliedThemeId, selectedThemeId } = useEditorColorTheme()
  return <span data-active-theme={`${selectedThemeId}|${appliedThemeId}`} hidden />
}

function activeEditorTab(state: EditorWorkspaceStore) {
  const activeTabId = state.workbenchPanels.activeEditorTabId
  if (!activeTabId) return null
  return state.workbenchPanels.editorTabs.find((tab) => tab.id === activeTabId) ?? null
}

function activeThemeIdentity(): string | null {
  return document.querySelector<HTMLElement>('[data-active-theme]')?.dataset.activeTheme ?? null
}

function preparationRequestTypes(): string[] {
  return performance
    .getEntriesByName('editor.worker.request', 'mark')
    .map((entry) => (entry as PerformanceMark).detail?.type)
    .filter((type): type is string => typeof type === 'string')
}

function postActivationTransferRequestTypes(): string[] {
  const transferRequests = new Set(['open', 'parse', 'queryRange'])
  return preparationRequestTypes().filter((type) => transferRequests.has(type))
}

function attachmentDiagnostic(): EditorDiagnostic | undefined {
  return diagnostics.findLast((diagnostic) => diagnostic.name === 'editor.document.attach')
}

function postActivationStructuralDiagnostics(): string[] {
  const structuralNames = new Set(['editor.line_starts.scan', 'editor.syntax.session_created'])
  return diagnostics
    .filter((diagnostic) => structuralNames.has(diagnostic.name))
    .map((diagnostic) => diagnostic.name)
}

function registeredForesightTarget() {
  const target = document.querySelector('[data-prepared-open-target]')
  if (!target) return null

  return ForesightManager.instance.getManagerData.registeredElements.get(target) ?? null
}

async function triggerForesightIntent(): Promise<void> {
  const target = document.querySelector<HTMLElement>('[data-prepared-open-target]')
  if (!target) throw new RangeError('prepared-open Foresight target unavailable')

  await triggerForesightElement(target)
}

async function triggerForesightElement(target: HTMLElement): Promise<void> {
  await expect
    .poll(() => ForesightManager.instance.getManagerData.loadedModules.desktopHandler)
    .toBe(true)
  const bounds = target.getBoundingClientRect()
  dispatchPointerMove(bounds.left + bounds.width / 2, bounds.bottom + 100)
  await nextAnimationFrame()
  dispatchPointerMove(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
  await nextAnimationFrame()
}

function dispatchPointerMove(clientX: number, clientY: number): void {
  document.dispatchEvent(
    new PointerEvent('pointermove', { bubbles: true, clientX, clientY, pointerType: 'mouse' }),
  )
}

async function activateAndCaptureFirstFrame() {
  const target = document.querySelector<HTMLButtonElement>('[data-prepared-open-target]')
  if (!target) throw new RangeError('prepared-open activation target unavailable')

  const firstFrame = new Promise<{ readonly rowCount: number; readonly text: string }>(
    (resolve) => {
      requestAnimationFrame(() => {
        resolve({
          rowCount: document.querySelectorAll('.editor-virtualized-row').length,
          text: document.querySelector('.editor-virtualized')?.textContent ?? '',
        })
      })
    },
  )
  target.click()
  return firstFrame
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function requiredRuntime(): PreparedOpenRuntime {
  if (!runtime) throw new RangeError('prepared-open runtime unavailable')
  return runtime
}

function rootFolder() {
  return {
    birthtimeMs: 0,
    mtimeMs: 0,
    name: ROOT_PATH,
    path: ROOT_PATH,
    size: 0,
    type: 'directory' as const,
    version: 'browser-fixture',
  }
}

type PreparedOpenRuntime = {
  readonly commands: EditorCommands
  readonly fileOpenIntent: FileOpenIntentService
  readonly queryClient: QueryClient
}

type EditorDiagnostic = {
  readonly detail?: Readonly<Record<string, unknown>>
  readonly name: string
}

const editorDiagnosticGlobal = globalThis as typeof globalThis & {
  __EDITOR_PERFORMANCE_DIAGNOSTICS__?: ((diagnostic: EditorDiagnostic) => void) | null
  __editorPerfTrace?: { readonly mark: () => void }
}
