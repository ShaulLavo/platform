import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { vi } from 'vitest'

import { DEFAULT_SETTING_VALUES, type SettingId, type SettingsValues } from '@workspace/contracts'

import { expect, test } from '../../../../test/fixtures'
import { EditorDocumentStateContext } from '@/features/editor/state/document-state'
import { EditorRuntimeContext } from '@/features/editor/providers/runtime-context'
import { createTestEditorRuntime } from '../../../../test/factories/editor-runtime'
import { useAutoSave } from '@/features/editor/hooks/use-auto-save'
import { WorkspaceEditServiceContext } from '@/features/editor/providers/workspace-edit-context'
import type { WorkspaceEditService } from '@/features/editor/state/workspace-edit-service'
import { settingsKeys } from '@workspace/client-core/settings/query-keys'
import type { FileResult } from '@/lib/file-system-types'

function harness(
  overrides: Partial<SettingsValues>,
  workspaceEdits: WorkspaceEditService | null = null,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(settingsKeys.document(), {
    diagnostics: [],
    layers: [],
    revision: '',
    values: { ...DEFAULT_SETTING_VALUES, ...overrides },
  })
  const runtime = createTestEditorRuntime(queryClient)
  const { documentStore } = runtime

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        WorkspaceEditServiceContext,
        { value: workspaceEdits },
        createElement(
          EditorRuntimeContext,
          { value: runtime },
          createElement(EditorDocumentStateContext, { value: documentStore }, children),
        ),
      ),
    )

  return { documentStore, queryClient, wrapper }
}

test('does nothing at all when autosave is off', async ({ client }) => {
  expect(client).toBeDefined()
  const { documentStore, wrapper } = harness({ 'files.autoSave': 'off' })
  const subscribe = documentStore.subscribe
  let subscriptions = 0
  documentStore.subscribe = ((...args: Parameters<typeof subscribe>) => {
    subscriptions += 1

    return subscribe(...args)
  }) as typeof subscribe

  renderHook(() => useAutoSave(), { wrapper })

  // Off means off: no store subscription and no window listener, so the default
  // costs nothing at all.
  expect(subscriptions).toBe(0)
})

test('subscribes to the document store when saving after a delay', async ({ client }) => {
  expect(client).toBeDefined()
  const { documentStore, wrapper } = harness({
    'files.autoSave': 'afterDelay',
    'files.autoSaveDelay': 100,
  })
  const subscribe = documentStore.subscribe
  let subscriptions = 0
  documentStore.subscribe = ((...args: Parameters<typeof subscribe>) => {
    subscriptions += 1

    return subscribe(...args)
  }) as typeof subscribe

  renderHook(() => useAutoSave(), { wrapper })

  await waitFor(() => expect(subscriptions).toBe(1))
})

test('listens for blur when saving on focus change', async ({ client }) => {
  expect(client).toBeDefined()
  const { wrapper } = harness({ 'files.autoSave': 'onWindowChange' })
  const added: string[] = []
  const original = window.addEventListener
  window.addEventListener = ((type: string, ...rest: unknown[]) => {
    added.push(type)

    return (original as never as (...args: unknown[]) => void)(type, ...rest)
  }) as typeof window.addEventListener

  renderHook(() => useAutoSave(), { wrapper })
  window.addEventListener = original

  expect(added).toContain('blur')
})

test('skips a focus-change save when the workspace mutation gate is closed', async ({ client }) => {
  expect(client).toBeDefined()
  const runWorkspaceMutation = vi.fn(
    async (_affectedPaths: readonly string[] | 'all', _operation: () => Promise<unknown>) => {
      throw { code: 'workspace-edit-busy' }
    },
  )
  const workspaceEdits = {
    runWorkspaceMutation,
  } as unknown as WorkspaceEditService
  const { documentStore, wrapper } = harness({ 'files.autoSave': 'onWindowChange' }, workspaceEdits)
  documentStore.getState().ensureLiveEditorDocument(fileResult('src/dirty.ts'))
  documentStore.getState().setLiveEditorDocumentDirty('src/dirty.ts', true)
  renderHook(() => useAutoSave(), { wrapper })

  window.dispatchEvent(new Event('blur'))

  await waitFor(() => expect(runWorkspaceMutation).toHaveBeenCalledOnce())
  expect(runWorkspaceMutation.mock.calls[0]?.[0]).toEqual(['src/dirty.ts'])
  expect(documentStore.getState().dirtyFilePaths).toContain('src/dirty.ts')
})

test('the setting exists with an off default, so nothing changes until asked', ({ client }) => {
  expect(client).toBeDefined()

  expect(DEFAULT_SETTING_VALUES['files.autoSave' as SettingId]).toBe('off')
  expect(DEFAULT_SETTING_VALUES['files.autoSaveDelay' as SettingId]).toBe(1_000)
})

function fileResult(path: string): FileResult {
  return {
    content: `contents of ${path}`,
    mtimeMs: 100,
    path,
    size: 20,
    version: `test:${path}`,
  }
}
