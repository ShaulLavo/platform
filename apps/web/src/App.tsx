import { AppContent } from '@/components/app-content'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { WorkspaceFocusProvider } from '@/components/workspace/workspace-focus-provider'
import { HotkeysProvider } from '@tanstack/react-hotkeys'

export function App() {
  return (
    <EditorStateProvider>
      <WorkspaceFocusProvider>
        <HotkeysProvider>
          <AppContent />
        </HotkeysProvider>
      </WorkspaceFocusProvider>
    </EditorStateProvider>
  )
}
