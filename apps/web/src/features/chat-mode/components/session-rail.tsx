import type { ProjectId, ThreadId } from '@workspace/contracts'
import { FolderPlusIcon, MagnifyingGlassIcon, PlusIcon, XIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import {
  selectChatProjects,
  selectChatSidebarThreads,
} from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { SessionRow } from '@/features/chat-mode/components/session-row'
import { SessionScopeMenu } from '@/features/chat-mode/components/session-scope-menu'
import {
  SessionRailContext,
  type SessionRailActions,
} from '@/features/chat-mode/providers/rail-context'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import {
  sessionRailModel,
  type SessionRailItem,
  type SessionRailScope,
} from '@/features/chat-mode/utils/session-rail-model'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'

export function SessionRail() {
  const { activeSession, addProject, openProject, project, ready, selectSession, startDraft } =
    useChatModeSession()
  const projects = useChatProjectionStore(selectChatProjects)
  const threads = useChatProjectionStore(selectChatSidebarThreads)
  const [scope, setScope] = useState<SessionRailScope>(null)
  const [query, setQuery] = useState('')
  const [renamingSessionId, setRenamingSessionId] = useState<ThreadId | null>(null)
  const model = sessionRailModel({
    activeProjectId: project?.id ?? null,
    projects,
    query,
    scope,
    threads,
  })

  function activateProject(projectId: string) {
    const owner = model.projects.find((candidate) => candidate.id === projectId)
    if (!owner) return
    if (owner.active) return

    openProject(owner.workspaceRoot)
  }

  function handleSelect(session: SessionRailItem) {
    activateProject(session.projectId)
    selectSession(session.projectId, session.id)
  }

  function startNewSession(projectId: ProjectId) {
    activateProject(projectId)
    startDraft(projectId)
  }

  function handleNewSession() {
    // Scoped to one project, "new session" means that one — otherwise the open one.
    const target = scope ? model.projects.find((candidate) => candidate.id === scope) : null
    if (target) {
      startNewSession(target.id)
      return
    }
    if (!project) return

    startDraft(project.id)
  }

  const rail: SessionRailActions = {
    endRename: () => setRenamingSessionId(null),
    openSession: handleSelect,
    renamingSessionId,
    scope,
    setScope,
    startNewSession,
    startRename: setRenamingSessionId,
  }

  return (
    <aside className='bg-card backdrop-material border-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r'>
      <div className='flex shrink-0 items-center gap-1 px-2 pt-2'>
        <Button
          className='h-8 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-[13px]'
          disabled={!ready && !scope}
          size='sm'
          type='button'
          variant='ghost'
          onClick={handleNewSession}
        >
          <PlusIcon className='size-4 shrink-0' weight='bold' />
          <span className='truncate'>New session</span>
        </Button>
        <Button
          aria-label='Add project'
          className='text-muted-foreground hover:text-foreground size-8 shrink-0 rounded-md'
          size='icon-sm'
          title='Add project'
          type='button'
          variant='ghost'
          onClick={addProject}
        >
          <FolderPlusIcon className='size-4' />
        </Button>
      </div>
      <div className='flex shrink-0 items-center gap-1 px-2 pt-1'>
        <SessionScopeMenu
          projects={model.projects}
          scope={scope}
          scopeTitle={model.scopeTitle}
          onSelectScope={setScope}
        />
        <span className='text-muted-foreground/60 ml-auto shrink-0 text-[11px] tabular-nums'>
          {model.scopedCount}
        </span>
      </div>
      <div className='relative shrink-0 px-2 py-2'>
        <MagnifyingGlassIcon className='text-muted-foreground/60 pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2' />
        <Input
          aria-label='Search sessions'
          // The native search affordances duplicate our own clear button.
          className='h-7 rounded-md pr-7 pl-7 text-[12px] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden'
          placeholder='Search sessions'
          type='search'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <Button
            aria-label='Clear search'
            className='text-muted-foreground hover:text-foreground absolute top-1/2 right-3 size-5 -translate-y-1/2 rounded-sm'
            size='icon-sm'
            type='button'
            variant='ghost'
            onClick={() => setQuery('')}
          >
            <XIcon className='size-3' />
          </Button>
        ) : null}
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <SessionRailContext value={rail}>
          <div className='flex flex-col gap-0.5 px-1 pb-3'>
            {model.sessions.map((session) => (
              <SessionRow
                active={session.id === activeSession.threadId}
                key={session.id}
                session={session}
                showProject={scope === null}
              />
            ))}
            {model.sessions.length === 0 ? (
              <p className='text-muted-foreground/60 px-2 py-3 text-[11px]'>
                {emptyLabel({ query, ready, scopedCount: model.scopedCount })}
              </p>
            ) : null}
          </div>
        </SessionRailContext>
      </div>
    </aside>
  )
}

function emptyLabel({
  query,
  ready,
  scopedCount,
}: {
  readonly query: string
  readonly ready: boolean
  readonly scopedCount: number
}) {
  if (query.trim()) return `No sessions match “${query.trim()}”.`
  if (scopedCount === 0 && !ready) return 'Connecting…'

  return 'No sessions yet.'
}
