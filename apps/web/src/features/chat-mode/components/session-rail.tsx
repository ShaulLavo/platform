import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import {
  ArchiveIcon,
  FolderPlusIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useState, type KeyboardEvent } from 'react'

import { selectChatProjects } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import { SessionBulkBar } from '@/features/chat-mode/components/session-bulk-bar'
import { SessionGroup } from '@/features/chat-mode/components/session-group'
import { SessionGroupHeader } from '@/features/chat-mode/components/session-group-header'
import { SessionScopeMenu } from '@/features/chat-mode/components/session-scope-menu'
import { useRailDragSensors } from '@/features/chat-mode/hooks/use-rail-drag-sensors'
import { useChatRailOrder } from '@/features/chat-mode/providers/rail-order-context'
import { useChatModeSession } from '@/features/chat-mode/providers/session-context'
import { useRailOrderStore } from '@/features/chat-mode/state/rail-order-store'
import {
  clearSessionMultiSelect,
  startScopedSessionDraft,
} from '@/features/chat-mode/state/session-commands'
import {
  isSessionBulkSelection,
  useSessionMultiSelectStore,
} from '@/features/chat-mode/state/session-multi-select-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { useSessionReadStore } from '@/features/chat-mode/state/session-read-store'
import {
  sessionRailModel,
  type SessionRailView,
} from '@/features/chat-mode/utils/session-rail-model'
import { sessionThreads } from '@/features/chat-mode/utils/session-threads'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { cn } from '@workspace/ui/lib/utils'

const RAIL_DND_MODIFIERS = [restrictToVerticalAxis]

export function SessionRail() {
  const { activeSession, addProject, project, ready } = useChatModeSession()
  const { reorderProject } = useChatRailOrder()
  const sensors = useRailDragSensors()
  const projectOrderKeys = useRailOrderStore((state) => state.projectOrderKeys)
  const sessionOrderKeys = useRailOrderStore((state) => state.sessionOrderKeys)
  const projects = useChatProjectionStore(selectChatProjects)
  const threadIds = useChatProjectionStore((state) => state.threadIds)
  const summaryById = useChatProjectionStore((state) => state.sidebarThreadSummaryById)
  const seenByThreadId = useSessionReadStore((state) => state.seenByThreadId)
  const collapsedProjectIds = useSessionRailStore((state) => state.collapsedProjectIds)
  const query = useSessionRailStore((state) => state.query)
  const scope = useSessionRailStore((state) => state.scope)
  const view = useSessionRailStore((state) => state.view)
  const setQuery = useSessionRailStore((state) => state.setQuery)
  const setScope = useSessionRailStore((state) => state.setScope)
  const setView = useSessionRailStore((state) => state.setView)
  const markedThreadIds = useSessionMultiSelectStore((state) => state.threadIds)
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const model = sessionRailModel({
    activeProjectId: project?.id ?? null,
    activeThreadId: activeSession.threadId,
    collapsedProjectIds,
    orderOverrides: { projectOrderKeys, sessionOrderKeys },
    projects,
    query,
    scope,
    seenByThreadId,
    threads: sessionThreads(threadIds, summaryById),
    view,
  })

  function toggleView() {
    setView(view === 'archived' ? 'active' : 'archived')
  }

  function handleProjectDragStart(event: DragStartEvent) {
    setDraggingProjectId(String(event.active.id))
  }

  function handleProjectDragEnd(event: DragEndEvent) {
    setDraggingProjectId(null)
    reorderProject(String(event.active.id), event.over ? String(event.over.id) : null)
  }

  const draggingGroup = model.groups.find((group) => group.project.id === draggingProjectId) ?? null

  // Escape is the universal "never mind" for a marked set, and the rail is the only
  // place it means that — the app keymap has no business knowing about this list.
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape') return
    if (markedThreadIds.length === 0) return

    event.preventDefault()
    clearSessionMultiSelect()
  }

  return (
    <aside
      className='bg-card backdrop-material border-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r'
      onKeyDown={handleKeyDown}
    >
      <div className='flex shrink-0 items-center gap-1 px-2 pt-2'>
        <Button
          className='h-8 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-[13px]'
          disabled={!ready && !scope}
          size='sm'
          type='button'
          variant='ghost'
          onClick={startScopedSessionDraft}
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
        <Button
          aria-label='Archived sessions'
          aria-pressed={view === 'archived'}
          className={cn(
            'text-muted-foreground hover:text-foreground ml-auto size-7 shrink-0 rounded-md',
            view === 'archived' && 'bg-accent text-accent-foreground',
          )}
          size='icon-sm'
          title={`Archived sessions (${model.archivedCount})`}
          type='button'
          variant='ghost'
          onClick={toggleView}
        >
          <ArchiveIcon className='size-3.5' />
        </Button>
        <span className='text-muted-foreground/60 shrink-0 text-[11px] tabular-nums'>
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
        <div className='flex flex-col gap-2 px-1 pb-3'>
          <DndContext
            collisionDetection={closestCenter}
            modifiers={RAIL_DND_MODIFIERS}
            sensors={sensors}
            onDragCancel={() => setDraggingProjectId(null)}
            onDragEnd={handleProjectDragEnd}
            onDragStart={handleProjectDragStart}
          >
            <SortableContext
              items={model.groups.map((group) => group.project.id)}
              strategy={verticalListSortingStrategy}
            >
              {model.groups.map((group) => (
                <SessionGroup
                  activeThreadId={activeSession.threadId}
                  group={group}
                  key={group.project.id}
                />
              ))}
            </SortableContext>
            {/* Only the header travels. Lifting the whole band — header plus every
                session row — made a project drag a page-sized slab. */}
            <DragOverlay dropAnimation={null}>
              {draggingGroup ? (
                <div className='bg-popover border-border pointer-events-none rounded-md border shadow-lg'>
                  <SessionGroupHeader group={draggingGroup} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {model.sessions.length === 0 ? (
            <p className='text-muted-foreground/60 px-2 py-3 text-[11px]'>
              {emptyLabel({ query, ready, scopedCount: model.scopedCount, view })}
            </p>
          ) : null}
        </div>
      </div>
      {isSessionBulkSelection(markedThreadIds) ? <SessionBulkBar /> : null}
    </aside>
  )
}

function emptyLabel({
  query,
  ready,
  scopedCount,
  view,
}: {
  readonly query: string
  readonly ready: boolean
  readonly scopedCount: number
  readonly view: SessionRailView
}) {
  if (query.trim()) return `No sessions match “${query.trim()}”.`
  if (view === 'archived') return 'No archived sessions.'
  if (scopedCount === 0 && !ready) return 'Connecting…'

  return 'No sessions yet.'
}
