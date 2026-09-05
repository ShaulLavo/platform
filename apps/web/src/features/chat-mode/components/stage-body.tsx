import type { SessionId } from '@workspace/contracts'
import { LoadingState } from '@workspace/ui/components/loading-state'
import { OrbitLoader } from '@workspace/ui/components/orbit-loader'
import { ChatDraftView } from '@/features/chat/components/chat-draft-view'
import { ChatView } from '@/features/chat/components/chat-view'
import { SessionMissingState } from '@/features/chat-mode/components/session-missing-state'
import { StageEmptyState } from '@/features/chat-mode/components/stage-empty-state'
import type { ChatModeSession } from '@/features/chat-mode/providers/session-context'
import { activeSessionShowsComposer } from '@/features/chat-mode/utils/active-session'

export function StageBody({
  activeSession,
  transport,
  project,
  worktree,
  ready,
  rootPath,
  onSessionCreated,
}: Pick<ChatModeSession, 'activeSession' | 'transport' | 'project' | 'worktree' | 'ready'> & {
  readonly rootPath: string
  readonly onSessionCreated: (sessionId: SessionId) => void
}) {
  // Before anything else: with no project there is no session to resolve, and a
  // composer that cannot send is the state this screen exists to replace.
  if (!ready) return <StageEmptyState />
  if (activeSession.status === 'resolving') {
    return (
      <LoadingState label='Opening session' className='p-4'>
        <OrbitLoader label='Opening session' />
      </LoadingState>
    )
  }
  if (activeSession.status === 'missing') return <SessionMissingState />
  if (activeSessionShowsComposer(activeSession)) {
    return (
      <ChatDraftView
        // Never disabled here: reaching this line means the project is ready, and the
        // states that are not get their own screen above.
        disabled={false}
        transport={transport}
        project={project}
        worktreeId={worktree?.id ?? null}
        rootPath={rootPath}
        onSessionCreated={onSessionCreated}
      />
    )
  }

  return (
    <ChatView
      activeSessionId={activeSession.sessionId}
      transport={transport}
      key={activeSession.sessionId}
      rootPath={rootPath}
      onSessionCreated={onSessionCreated}
    />
  )
}
