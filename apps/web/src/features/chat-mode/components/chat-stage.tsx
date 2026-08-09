import type { ThreadId } from '@workspace/contracts'

import { ChatDraftView } from '@/features/chat/components/chat-draft-view'
import { ChatView } from '@/features/chat/components/chat-view'
import { contextUsageForActivities } from '@/features/chat/lib/context-usage'
import { threadStatus } from '@/features/chat/lib/thread-status'
import { selectChatThreadById } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { StageHeader } from '@/features/chat-mode/components/stage-header'
import {
  useChatModeSession,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { activeSessionShowsComposer, isDraftFor } from '@/features/chat-mode/utils/active-session'

const EMPTY_ACTIVITIES: readonly [] = []

export function ChatStage() {
  const { activeSession, environment, error, project, ready, rootPath, selectSession, threads } =
    useChatModeSession()
  const summary = threads.find((candidate) => candidate.id === activeSession.threadId) ?? null
  // Activities carry the provider's context-window snapshots, and only the detail
  // projection has them — the sidebar summary stops at the turn state.
  const activities = useChatProjectionStore(
    (state) => selectChatThreadById(state, activeSession.threadId)?.activities ?? EMPTY_ACTIVITIES,
  )

  function handleThreadCreated(threadId: ThreadId) {
    if (!project) return
    // The dispatch may ack after the user has already picked something else; the
    // draft that started it is stale by then and must not win.
    if (!isDraftFor(useSessionSelectionStore.getState().selection, project.id)) return

    selectSession(project.id, threadId)
  }

  return (
    <section className='bg-background backdrop-material flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
      <StageHeader
        branch={summary?.branch ?? null}
        contextUsage={contextUsageForActivities(activities)}
        projectTitle={project?.title ?? null}
        status={summary ? threadStatus(summary) : null}
        title={summary?.title ?? 'New session'}
      />
      <div className='mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden'>
        {stageBody({
          activeSession,
          environment,
          project,
          ready,
          rootPath,
          onThreadCreated: handleThreadCreated,
        })}
      </div>
      {error ? (
        <p className='text-destructive border-border shrink-0 border-t px-4 py-2 text-[11px]'>
          {error}
        </p>
      ) : null}
    </section>
  )
}

function stageBody({
  activeSession,
  environment,
  project,
  ready,
  rootPath,
  onThreadCreated,
}: Pick<ChatModeSession, 'activeSession' | 'environment' | 'project' | 'ready'> & {
  readonly rootPath: string
  readonly onThreadCreated: (threadId: ThreadId) => void
}) {
  if (activeSession.status === 'resolving') {
    return (
      <div className='text-muted-foreground flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs'>
        Opening session
      </div>
    )
  }
  if (activeSessionShowsComposer(activeSession)) {
    return (
      <ChatDraftView
        disabled={!ready}
        environment={environment}
        project={project}
        rootPath={rootPath}
        onThreadCreated={onThreadCreated}
      />
    )
  }

  return (
    <ChatView
      activeThreadId={activeSession.threadId}
      environment={environment}
      key={activeSession.threadId}
      rootPath={rootPath}
    />
  )
}
