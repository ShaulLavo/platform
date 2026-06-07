import { describe, expect, test } from 'vitest'

import { searchRuntimeEnabled } from '@/components/workspace/search/utils/search-runtime-state'
import {
  createClassicFirstRunWorkspaceLayout,
  createEmptyWorkspaceLayout,
  createSearchResultsSurface,
} from '@/features/tiling-surface-manager/engine/layout-builders'
import { openSurface } from '@/features/tiling-surface-manager/engine/layout-operations'

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
          workspaceLayout,
        },
        rootPath,
      ),
    ).toBe(true)
  })

  test('runs while the search results surface is backgrounded', () => {
    expect(
      searchRuntimeEnabled(
        {
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
          workspaceLayout: createEmptyWorkspaceLayout(),
        },
        rootPath,
      ),
    ).toBe(false)
  })
})
