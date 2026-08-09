import {
  ClockCounterClockwiseIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  PlusIcon,
} from '@phosphor-icons/react'
import {
  selectChatProjects,
  selectChatSidebarThreads,
} from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { SessionGroup } from '@/features/chat-mode/components/session-group'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import {
  sessionRailModel,
  type SessionRailItem,
  type SessionRailProject,
} from '@/features/chat-mode/utils/session-rail-model'
import { Button } from '@workspace/ui/components/button'

export function SessionRail() {
  const { activeSession, addProject, openProject, project, ready, selectSession, startDraft } =
    useChatModeSession()
  const projects = useChatProjectionStore(selectChatProjects)
  const threads = useChatProjectionStore(selectChatSidebarThreads)
  const model = sessionRailModel({
    activeProjectId: project?.id ?? null,
    projects,
    threads,
  })

  function revealProject(railProject: SessionRailProject) {
    if (railProject.active) return

    openProject(railProject.workspaceRoot)
  }

  function handleSelect(session: SessionRailItem) {
    const owner = model.projects.find((candidate) => candidate.id === session.projectId)
    if (owner) revealProject(owner)

    selectSession(session.projectId, session.id)
  }

  function handleNewSessionIn(railProject: SessionRailProject) {
    revealProject(railProject)
    startDraft(railProject.id)
  }

  return (
    <aside className='bg-card backdrop-material border-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r'>
      <div className='flex shrink-0 items-center gap-1 px-2 py-2'>
        <Button
          className='h-8 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-[13px]'
          disabled={!ready}
          size='sm'
          type='button'
          variant='ghost'
          onClick={() => project && startDraft(project.id)}
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
      <div className='min-h-0 flex-1 overflow-y-auto'>
        <div className='flex flex-col px-1 pb-3'>
          <SessionGroup
            activeThreadId={activeSession.threadId}
            emptyLabel={ready ? 'No sessions yet.' : 'Connecting…'}
            icon={<ClockCounterClockwiseIcon className='size-3' />}
            label='recent'
            sessions={model.recent}
            showProject
            onSelect={handleSelect}
          />
          {model.projects.map((railProject) => (
            <SessionGroup
              action={newSessionButton(railProject, handleNewSessionIn)}
              activeThreadId={activeSession.threadId}
              emphasized={railProject.active}
              icon={<FolderOpenIcon className='size-3' weight='duotone' />}
              key={railProject.id}
              label={railProject.title}
              qualifier={railProject.qualifier}
              sessions={railProject.sessions}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    </aside>
  )
}

function newSessionButton(
  railProject: SessionRailProject,
  onNewSession: (railProject: SessionRailProject) => void,
) {
  const name = railProject.qualifier
    ? `${railProject.title} (${railProject.qualifier})`
    : railProject.title
  const label = `New session in ${name}`

  return (
    <Button
      aria-label={label}
      className='text-muted-foreground hover:text-foreground size-5 shrink-0 rounded-sm opacity-60 hover:opacity-100'
      size='icon-sm'
      title={label}
      type='button'
      variant='ghost'
      onClick={() => onNewSession(railProject)}
    >
      <PlusIcon className='size-3' weight='bold' />
    </Button>
  )
}
