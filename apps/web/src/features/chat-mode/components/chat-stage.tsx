import type { ThreadId } from '@workspace/contracts'

import { ChatDraftView } from '@/features/chat/components/chat-draft-view'
import { ChatView } from '@/features/chat/components/chat-view'
import { contextUsageForActivities } from '@/features/chat/utils/context-usage'
import { selectChatThreadById } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { SessionMissingState } from '@/features/chat-mode/components/session-missing-state'
import { StageEmptyState } from '@/features/chat-mode/components/stage-empty-state'
import { StageHeader } from '@/features/chat-mode/components/stage-header'
import { useMarkSessionSeen } from '@/features/chat-mode/hooks/use-mark-session-seen'
import {
  useChatModeSession,
  type ChatModeSession,
} from '@/features/chat-mode/providers/session-context'
import { useSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import { useSessionSelectionStore } from '@/features/chat-mode/state/session-selection-store'
import { activeSessionShowsComposer, isDraftFor } from '@/features/chat-mode/utils/active-session'
import { sessionRailItem } from '@/features/chat-mode/utils/session-rail-model'
import { sessionCompletedAt } from '@/features/chat-mode/utils/session-unread'

const EMPTY_ACTIVITIES: readonly [] = []

export function ChatStage() {
  const { activeSession, transport, error, project, ready, rootPath, selectSession } =
    useChatModeSession()
  // Read by id rather than from the provider's list: the archive browser can put a
  // filed-away session on the stage, and that list deliberately excludes them.
  const summary = useChatProjectionStore((state) =>
    activeSession.threadId ? (state.threadById[activeSession.threadId] ?? null) : null,
  )
  const seenByThreadId = useSessionReadStore((state) => state.seenByThreadId)
  // Activities carry the provider's context-window snapshots, and only the detail
  // projection has them — the sidebar summary stops at the turn state.
  const activities = useChatProjectionStore(
    (state) => selectChatThreadById(state, activeSession.threadId)?.activities ?? EMPTY_ACTIVITIES,
  )
  const session = summary
    ? sessionRailItem(summary, project?.title ?? 'Workspace', seenByThreadId[summary.id])
    : null

  useMarkSessionSeen(summary?.id ?? null, summary ? sessionCompletedAt(summary) : null)

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
        contextUsage={contextUsageForActivities(activities)}
        projectTitle={project?.title ?? null}
        session={session}
      />
      <div className='mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden'>
        {stageBody({
          activeSession,
          transport,
          project,
          ready,
          rootPath,
          onThreadCreated: handleThreadCreated,
        })}
      </div>
      {error ? (
        <p className='text-destructive border-border compact:px-3 compact:py-1.5 shrink-0 border-t px-4 py-2 text-[11px]'>
          {error}
        </p>
      ) : null}
    </section>
  )
}

function stageBody({
  activeSession,
  transport,
  project,
  ready,
  rootPath,
  onThreadCreated,
}: Pick<ChatModeSession, 'activeSession' | 'transport' | 'project' | 'ready'> & {
  readonly rootPath: string
  readonly onThreadCreated: (threadId: ThreadId) => void
}) {
  // Before anything else: with no project there is no session to resolve, and a
  // composer that cannot send is the state this screen exists to replace.
  if (!ready) return <StageEmptyState />
  if (activeSession.status === 'resolving') {
    return (
      <div className='text-muted-foreground flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs'>
        Opening session
      </div>
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
        rootPath={rootPath}
        onThreadCreated={onThreadCreated}
      />
    )
  }

  return (
    <ChatView
      activeThreadId={activeSession.threadId}
      transport={transport}
      key={activeSession.threadId}
      rootPath={rootPath}
      onThreadCreated={onThreadCreated}
    />
  )
}
