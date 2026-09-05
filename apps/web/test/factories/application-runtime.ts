import { onTestFinished } from 'vitest'
import { readWorkspaceCache } from '@/features/workspace/state/cache'
import { createApplicationRuntime } from '@/state/application-runtime'

export function createTestApplicationRuntime() {
  const application = createApplicationRuntime({
    workspaceCache: readWorkspaceCache(),
    preparation: {
      appliedThemeContentHash: null,
      appliedThemeId: null,
      selectedThemeId: 'dark-plus',
      syntaxHighlightingEnabled: false,
    },
  })
  onTestFinished(() => application.dispose())
  return application
}
