import { AppContent } from '@/components/app-content'
import { ChatProviderSignInProvider } from '@/features/chat/providers/provider-sign-in-provider'
import { EditorStateProvider } from '@/features/editor/editor-state-provider'
import { FocusProvider } from '@/components/workspace/focus/providers/focus-provider'
import { HotkeysProvider } from '@tanstack/react-hotkeys'

export function App() {
  return (
    <EditorStateProvider>
      <FocusProvider>
        <HotkeysProvider>
          {/* Above AppContent: provider sign-in is machine-wide, and both chat
              surfaces (workbench panel and chat mode) offer it. */}
          <ChatProviderSignInProvider>
            <AppContent />
          </ChatProviderSignInProvider>
        </HotkeysProvider>
      </FocusProvider>
    </EditorStateProvider>
  )
}
