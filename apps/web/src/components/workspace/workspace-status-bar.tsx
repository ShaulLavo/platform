import { EditorStatusBar } from "@/features/editor/components/editor-status-bar"
import { useEditorUiState } from "@/features/editor/state/editor-ui-state"

export function WorkspaceStatusBar() {
  const statusBarState = useEditorUiState((state) => state.statusBarState)

  return <EditorStatusBar status={statusBarState} />
}
