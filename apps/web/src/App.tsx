import { AppContent } from '@/components/app-content'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { FocusProvider } from '@/components/workspace/focus/providers/focus-provider'
import { HotkeysProvider } from '@tanstack/react-hotkeys'

export function App() {
  return (
    <EditorStateProvider>
      <FocusProvider>
        <HotkeysProvider>
          <AppContent />
        </HotkeysProvider>
      </FocusProvider>
    </EditorStateProvider>
  )
}
