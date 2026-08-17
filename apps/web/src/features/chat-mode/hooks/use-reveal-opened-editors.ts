import { useEffect } from 'react'

import { useEditorWorkspaceStoreApi } from '@/features/editor/state/workspace-state'
import { showChatModeToolTab } from '@/features/chat-mode/utils/panels'

/**
 * Files, Git, and Search open editor tabs, but chat mode shows one tool pane at a
 * time. Without this the tab opens behind whatever pane is up and the click looks
 * like it did nothing.
 */
export function useRevealOpenedEditors() {
  const store = useEditorWorkspaceStoreApi()

  useEffect(
    () =>
      store.subscribe(
        (state) => state.workbenchPanels.activeEditorTabId,
        (activeEditorTabId) => {
          if (!activeEditorTabId) return

          const { chatModePanels, setChatModePanels } = store.getState()
          setChatModePanels(showChatModeToolTab(chatModePanels, 'editor'))
        },
      ),
    [store],
  )
}
