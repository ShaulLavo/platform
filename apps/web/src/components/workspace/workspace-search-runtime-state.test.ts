import { describe, expect, test } from 'bun:test'

import { workspaceSearchRuntimeEnabled } from '@/components/workspace/workspace-search-runtime-state'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'

const rootPath = '/workspace'

describe('workspace search runtime state', () => {
  test('runs while the sidebar search tab is visible', () => {
    expect(
      workspaceSearchRuntimeEnabled(
        {
          selectedFilePath: null,
          sidebarVisible: true,
          workspacePanelTab: 'search',
        },
        rootPath,
      ),
    ).toBe(true)
  })

  test('runs from the selected search editor tab without the sidebar search tab', () => {
    expect(
      workspaceSearchRuntimeEnabled(
        {
          selectedFilePath: searchBufferDocumentId(rootPath),
          sidebarVisible: false,
          workspacePanelTab: 'files',
        },
        rootPath,
      ),
    ).toBe(true)
    expect(
      workspaceSearchRuntimeEnabled(
        {
          selectedFilePath: searchBufferDocumentId(rootPath),
          sidebarVisible: true,
          workspacePanelTab: 'git',
        },
        rootPath,
      ),
    ).toBe(true)
  })

  test('stays idle when no search surface is active for the workspace', () => {
    expect(
      workspaceSearchRuntimeEnabled(
        {
          selectedFilePath: null,
          sidebarVisible: false,
          workspacePanelTab: 'search',
        },
        rootPath,
      ),
    ).toBe(false)
    expect(
      workspaceSearchRuntimeEnabled(
        {
          selectedFilePath: searchBufferDocumentId('/other-workspace'),
          sidebarVisible: false,
          workspacePanelTab: 'files',
        },
        rootPath,
      ),
    ).toBe(false)
  })
})
