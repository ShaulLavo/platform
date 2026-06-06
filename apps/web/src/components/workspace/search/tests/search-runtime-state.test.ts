import { describe, expect, test } from 'vitest'

import { searchRuntimeEnabled } from '@/components/workspace/search/utils/search-runtime-state'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'

const rootPath = '/workspace'

describe('workspace search runtime state', () => {
  test('runs while the sidebar search tab is visible', () => {
    expect(
      searchRuntimeEnabled(
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
      searchRuntimeEnabled(
        {
          selectedFilePath: searchBufferDocumentId(rootPath),
          sidebarVisible: false,
          workspacePanelTab: 'files',
        },
        rootPath,
      ),
    ).toBe(true)
    expect(
      searchRuntimeEnabled(
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
      searchRuntimeEnabled(
        {
          selectedFilePath: null,
          sidebarVisible: false,
          workspacePanelTab: 'search',
        },
        rootPath,
      ),
    ).toBe(false)
    expect(
      searchRuntimeEnabled(
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
