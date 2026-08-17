import { AppContent } from '@/components/app-content'
import { ChatProviderSignInProvider } from '@/features/chat/providers/provider-sign-in-provider'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import { FocusProvider } from '@/components/workspace/focus/providers/focus-provider'
import { HotkeysProvider } from '@tanstack/react-hotkeys'

/**
 * Never put a route hierarchy above `EditorStateProvider`. That provider creates the
 * workspace store and the document service holding unsaved buffers, and a router
 * unmounts a route component when its route id changes — so routing above this line
 * silently discards every project's unsaved work on a project switch, keyed or not.
 *
 * The address layer writes the URL directly through `history` for exactly this reason:
 * it is a serialization of where you are, not a mount point.
 */
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
