import type { QueryClient } from '@tanstack/react-query'

import { addressedWorkspaceCache } from '@/features/address/utils/cache'
import { parseAddress } from '@/features/address/utils/grammar'
import { createEditorRuntime } from '@/features/editor/state/runtime'
import { readSettingsMirror } from '@/features/settings/utils/boot-mirror'
import { readWorkspaceCache, type CachedWorkspaceState } from '@/features/workspace/state/cache'
import { activeServerOrigin, getClient } from '@/lib/client'
import { registerEnvironmentQueryClient } from '@/lib/environments/state/query-clients'

export function createTestEditorRuntime(
  queryClient: QueryClient,
  workspaceCache: CachedWorkspaceState = addressedWorkspaceCache(
    readWorkspaceCache(),
    parseAddress(window.location.href),
  ),
) {
  registerEnvironmentQueryClient(queryClient, activeServerOrigin(), getClient())
  return createEditorRuntime({
    queryClient,
    workspaceCache,
    preparation: {
      appliedThemeContentHash: null,
      appliedThemeId: null,
      selectedThemeId: 'dark',
      syntaxHighlightingEnabled: readSettingsMirror()['editor.syntaxHighlighting.enabled'],
    },
  })
}
