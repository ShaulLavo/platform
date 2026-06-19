import { useMemo, type ReactNode } from 'react'

import type { RequestCloseTab } from '@/features/editor/hooks/use-dirty-tab-close'
import {
  EditorTabActionsContext,
  type EditorTabActions,
} from '@/features/editor/providers/editor-tab-actions-context'
import { useEditorCommands } from '@/features/editor/state/editor-commands'

export function EditorTabActionsProvider({
  children,
  requestCloseTab,
}: {
  readonly children: ReactNode
  readonly requestCloseTab: RequestCloseTab
}) {
  const commands = useEditorCommands()
  // Keep the context value stable so app chrome renders do not invalidate every tab button.
  const value = useMemo<EditorTabActions>(
    () => ({
      requestCloseTab,
      reorderTab: (tabId, targetIndex) => commands.reorderTab('main', tabId, targetIndex),
      selectTab: (tabId) => commands.selectTab('main', tabId),
    }),
    [commands, requestCloseTab],
  )

  return <EditorTabActionsContext value={value}>{children}</EditorTabActionsContext>
}
