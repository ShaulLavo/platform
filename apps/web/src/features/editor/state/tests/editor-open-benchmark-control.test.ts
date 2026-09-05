import { testScopedStorage } from '../../../../../test/factories/scoped-storage'
// @vitest-environment happy-dom

import { QueryClient } from '@tanstack/react-query'
import { describe, expect, test, vi } from 'vitest'

import { createEditorOpenBenchmarkControl } from '@/features/editor/state/editor-open-benchmark-control'
import { createEditorDocumentStore } from '@/features/editor/state/document-state'
import { createEditorUiStore } from '@/features/editor/state/ui-state'
import { createEditorWorkspaceStore } from '@/features/editor/state/workspace-state'
import { createSearchBufferStore } from '@/features/search/state/buffer-state'
import { createDefaultWorkbenchPanels } from '@/features/workbench/utils/panels'
import { createEditorTabRecord } from '@/features/workspace/utils/tab-model'
import type { FileOpenIntentService } from '@/lib/file-open-intent/state/service'
import { MountedEditorRegistry } from '@/lib/file-open-intent/state/mounted-editor-registry'

describe('editor-open benchmark control', () => {
  test('rejects a target shared by multiple tabs before closing either tab', async () => {
    const path = '/repo/a.ts'
    const first = createEditorTabRecord(path)
    const second = createEditorTabRecord(path)
    const inert = createEditorTabRecord('search-buffer:%2Frepo')
    const workspaceStore = createEditorWorkspaceStore()
    workspaceStore.getState().switchWorkspace(rootFolder())
    workspaceStore.getState().setWorkbenchPanels({
      ...createDefaultWorkbenchPanels(),
      activeEditorTabId: first.id,
      editorTabs: [inert, first, second],
    })
    const quarantineBenchmarkSample = vi.fn()
    const control = createEditorOpenBenchmarkControl({
      storage: testScopedStorage,
      documentStore: createEditorDocumentStore(),
      fileOpenIntent: { quarantineBenchmarkSample } as unknown as FileOpenIntentService,
      mountedEditors: new MountedEditorRegistry(),
      queryClient: new QueryClient(),
      searchStore: createSearchBufferStore(),
      uiStore: createEditorUiStore(),
      workspaceStore,
    })

    await expect(
      control.reset({ path, rootPath: '/repo', sampleId: 'shared-target' }),
    ).rejects.toThrow('Editor-open benchmark target is shared by multiple tabs')

    expect(quarantineBenchmarkSample).toHaveBeenCalledWith('shared-target')
    expect(workspaceStore.getState().workbenchPanels.editorTabs).toEqual([inert, first, second])
  })
})

function rootFolder() {
  return {
    birthtimeMs: 0,
    mtimeMs: 0,
    name: 'repo',
    path: '/repo',
    size: 0,
    type: 'directory' as const,
    version: 'test',
  }
}
