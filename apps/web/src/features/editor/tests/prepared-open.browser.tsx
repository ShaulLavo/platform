import '@workspace/ui/globals.css'
import '@singapor/core/style.css'
import '@singapor/gutters/style.css'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useLayoutEffect } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'

import { EditorStateProvider } from '@/features/editor/providers/state-provider'
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
import { ensureFileSnapshotQuery } from '@/lib/file-snapshot-query-cache'
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
  'promotes a fully prepared workbench open without post-activation structural work',
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
    performance.clearMarks('editor.worker.request')
    harness.fileOpenIntent.prepare(PATH)
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
    flushSync(() => harness.commands.openFileSurface(PATH))

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
