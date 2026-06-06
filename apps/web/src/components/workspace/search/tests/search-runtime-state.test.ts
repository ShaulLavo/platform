import { describe, expect, test } from 'vitest'

import { searchRuntimeEnabled } from '@/components/workspace/search/utils/search-runtime-state'
import { searchBufferDocumentId } from '@/features/search/search-buffer-document'
import {
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
  createSearchResultsSurface,
} from '@/features/workbench/tiling-surface-manager/layout-builders'
import { openSurface } from '@/features/workbench/tiling-surface-manager/layout-operations'

const rootPath = '/workspace'

describe('workspace search runtime state', () => {
  test('runs while the search results surface is visible', () => {
    const workspaceLayout = openSurface(
      createClassicFirstRunWorkspaceLayout(),
      createSearchResultsSurface(),
    )

    expect(
      searchRuntimeEnabled(
        {
          selectedFilePath: null,
          workspaceLayout,
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
          workspaceLayout: createEmptyWorkspaceLayout(),
        },
        rootPath,
      ),
    ).toBe(true)
    expect(
      searchRuntimeEnabled(
        {
          selectedFilePath: searchBufferDocumentId(rootPath),
          workspaceLayout: createClassicFirstRunWorkspaceLayout(),
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
          workspaceLayout: createEmptyWorkspaceLayout(),
        },
        rootPath,
      ),
    ).toBe(false)
    expect(
      searchRuntimeEnabled(
        {
          selectedFilePath: searchBufferDocumentId('/other-workspace'),
          workspaceLayout: createEmptyWorkspaceLayout(),
        },
        rootPath,
      ),
    ).toBe(false)
  })
})
