import type { ClientOrchestrationCommand, ProjectId, ThreadId } from '@workspace/contracts'

import type { ChatEnvironment } from '@/features/chat/environment/chat-environment'
import {
  createProjectReorderCommand,
  createSessionPlaceCommand,
  createSessionReorderCommand,
} from '@/features/chat/utils/command-builders'
import { dispatchChatCommand } from '@/features/chat/utils/command-dispatch'
import { selectChatProjects } from '@/features/chat/state/chat-projection-selectors'
import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import {
  settleProjectOrder,
  settleSessionOrder,
  useRailOrderStore,
} from '@/features/chat-mode/state/rail-order-store'
import { useSessionRailStore } from '@/features/chat-mode/state/session-rail-store'
import { railReorderIntent, type RailOrderRow } from '@/features/chat-mode/utils/rail-reorder'
import { sessionRailModel } from '@/features/chat-mode/utils/session-rail-model'
import { selectChatSessionThreads } from '@/features/chat/state/chat-projection-selectors'
import { log } from '@/lib/client-logging'

/**
 * A drop on the project band. The key is minted from the neighbours the project
 * lands between, written locally so the list redraws under the pointer, and then
 * dispatched — one key, one row, and the neighbours are never touched.
 */
export function reorderRailProject({
  activeId,
  environment,
  overId,
}: {
  readonly activeId: string
  readonly environment: ChatEnvironment
  readonly overId: string | null
}) {
  const intent = railReorderIntent({ activeId, overId, rows: railProjectRows() })
  if (!intent) {
    logReorderBlocked({ activeId, kind: 'project', overId })

    return
  }

  const projectId = intent.id
  useRailOrderStore.getState().placeProject(projectId, intent.orderKey)
  void dispatchRailOrder({
    command: createProjectReorderCommand({ orderKey: intent.orderKey, projectId }),
    environment,
    id: projectId,
    kind: 'project',
    release: () => useRailOrderStore.getState().releaseProject(projectId),
    settle: () => settleProjectOrder(projectId, intent.orderKey),
  })
}

/**
 * A drop inside one project's band. Cross-project drops are refused rather than
 * silently reassigning the thread's project — moving a session between projects
 * is a different command with a different blast radius.
 */
export function reorderRailSession({
  activeId,
  environment,
  overId,
}: {
  readonly activeId: string
  readonly environment: ChatEnvironment
  readonly overId: string | null
}) {
  const sessions = railOrderModel().sessions
  const active = sessions.find((session) => session.id === activeId)
  const over = sessions.find((session) => session.id === overId)
  const owned = sessions.filter((session) => session.projectId === active?.projectId)
  const intent =
    // An archived session has left the list; the server refuses to arrange one,
    // and the archive browser is a place to find sessions, not to order them.
    active && over && !active.archived && active.projectId === over.projectId
      ? railReorderIntent({
          activeId,
          overId,
          rows: owned.map((session) => ({ id: session.id, orderKey: session.pinOrderKey })),
        })
      : null
  if (!intent) {
    logReorderBlocked({ activeId, kind: 'session', overId })

    return
  }

  const threadId = intent.id
  useRailOrderStore.getState().placeSession(threadId, intent.orderKey)
  void dispatchRailOrder({
    command: sessionOrderCommand(threadId, intent.orderKey, active?.pinOrderKey ?? null),
    environment,
    id: threadId,
    kind: 'session',
    release: () => useRailOrderStore.getState().releaseSession(threadId),
    settle: () => settleSessionOrder(threadId, intent.orderKey),
  })
}

/**
 * A session that holds no slot yet is not in the arranged run, and the server
 * refuses to reorder a thread that was never placed there — so its first drag
 * carries the key in as the pin's opening position instead. Every later drag is
 * a plain reorder.
 */
function sessionOrderCommand(threadId: ThreadId, orderKey: string, currentOrderKey: string | null) {
  if (!currentOrderKey) return createSessionPlaceCommand({ orderKey, threadId })

  return createSessionReorderCommand({ orderKey, threadId })
}

async function dispatchRailOrder({
  command,
  environment,
  id,
  kind,
  release,
  settle,
}: {
  readonly command: ClientOrchestrationCommand
  readonly environment: ChatEnvironment
  readonly id: string
  readonly kind: 'project' | 'session'
  readonly release: () => void
  readonly settle: () => void
}) {
  await dispatchChatCommand({
    action: 'chat.rail.reorder',
    command,
    context: { kind, orderKey: 'orderKey' in command ? command.orderKey : null, rowId: id },
    dispatchCommand: environment.dispatchCommand,
    onAccepted: settle,
    // The optimistic key was the only thing holding the row in its new slot, so
    // dropping it is what puts the list back on the server's order.
    onFailed: release,
  })
}

function logReorderBlocked({
  activeId,
  kind,
  overId,
}: {
  readonly activeId: string
  readonly kind: 'project' | 'session'
  readonly overId: string | null
}) {
  log.debug({
    action: 'chat.rail.reorder',
    area: 'chat',
    kind,
    outcome: 'blocked',
    overId,
    reason: 'no-move',
    rowId: activeId,
  })
}

function railProjectRows(): RailOrderRow<ProjectId>[] {
  return railOrderModel().projects.map((project) => ({
    id: project.id,
    orderKey: project.orderKey,
  }))
}

/**
 * The rail's order rebuilt from the same stores it renders from, minus the
 * search and the scope: a drop has to be resolved against every row of the list
 * it belongs to, including the ones a narrowed view is currently hiding.
 */
function railOrderModel() {
  const projection = useChatProjectionStore.getState()

  return sessionRailModel({
    orderOverrides: useRailOrderStore.getState(),
    projects: selectChatProjects(projection),
    threads: selectChatSessionThreads(projection),
    view: useSessionRailStore.getState().view,
  })
}
