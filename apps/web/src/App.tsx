import { AppContent } from '@/components/app-content'
import { ChatProviderSignInProvider } from '@/features/chat/providers/provider-sign-in-provider'
import { EditorStateProvider } from '@/features/editor/providers/state-provider'
import { FocusProvider } from '@/lib/focus/providers/provider'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { WorkspaceEditPreviewDialog } from '@/features/editor/components/workspace-edit-preview-dialog'
import { WorkspaceEditRecoveryDialog } from '@/features/editor/components/workspace-edit-recovery-dialog'

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
          <WorkspaceEditPreviewDialog />
          <WorkspaceEditRecoveryDialog />
        </HotkeysProvider>
      </FocusProvider>
    </EditorStateProvider>
  )
}
