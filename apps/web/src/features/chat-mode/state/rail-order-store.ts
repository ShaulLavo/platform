import type { ProjectId, ThreadId } from '@workspace/contracts'
import { create } from 'zustand'

import {
  useChatProjectionStore,
  type ChatProjectionState,
} from '@/features/chat/state/chat-projection-store'
import type { RailOrderOverrides } from '@/features/chat-mode/utils/session-rail-model'

/**
 * The keys a drag has written but the server has not confirmed yet.
 *
 * A drop has to redraw the list immediately — the row is under the pointer the
 * user just released — but the projection only learns the new key when the
 * command's event comes back down the shell stream. These entries stand in for
 * that gap and are dropped the moment the projection agrees, or the moment the
 * dispatch fails, so a refusal falls back to the server's order rather than
 * stranding a row where nobody put it.
 */
type RailOrderStore = RailOrderOverrides & {
  readonly placeProject: (projectId: ProjectId, orderKey: string) => void
  readonly placeSession: (threadId: ThreadId, orderKey: string) => void
  readonly releaseProject: (projectId: ProjectId) => void
  readonly releaseSession: (threadId: ThreadId) => void
}

export const useRailOrderStore = create<RailOrderStore>()((set) => ({
  placeProject: (projectId, orderKey) =>
    set((state) => ({ projectOrderKeys: { ...state.projectOrderKeys, [projectId]: orderKey } })),
  placeSession: (threadId, orderKey) =>
    set((state) => ({ sessionOrderKeys: { ...state.sessionOrderKeys, [threadId]: orderKey } })),
  projectOrderKeys: {},
  releaseProject: (projectId) =>
    set((state) => ({ projectOrderKeys: withoutKey(state.projectOrderKeys, projectId) })),
  releaseSession: (threadId) =>
    set((state) => ({ sessionOrderKeys: withoutKey(state.sessionOrderKeys, threadId) })),
  sessionOrderKeys: {},
}))

export function resetRailOrderStore() {
  useRailOrderStore.setState({ projectOrderKeys: {}, sessionOrderKeys: {} })
}

/** Holds the optimistic project key until the projection carries the same one. */
export function settleProjectOrder(projectId: ProjectId, orderKey: string) {
  settleWhenProjected({
    orderKey,
    pending: () => useRailOrderStore.getState().projectOrderKeys[projectId],
    projected: (state) => state.projectById[projectId]?.orderKey ?? null,
    release: () => useRailOrderStore.getState().releaseProject(projectId),
  })
}

/** Holds the optimistic session key until the projection carries the same one. */
export function settleSessionOrder(threadId: ThreadId, orderKey: string) {
  settleWhenProjected({
    orderKey,
    pending: () => useRailOrderStore.getState().sessionOrderKeys[threadId],
    projected: (state) => state.sidebarThreadSummaryById[threadId]?.pinOrderKey ?? null,
    release: () => useRailOrderStore.getState().releaseSession(threadId),
  })
}

/**
 * Watches the projection rather than clearing on the dispatch's reply: the reply
 * only says the command was accepted, and dropping the override before its event
 * lands would flash the pre-drag order for a frame. The watch also ends when the
 * pending entry stops being ours — a failed dispatch or a second drag.
 */
function settleWhenProjected({
  orderKey,
  pending,
  projected,
  release,
}: {
  readonly orderKey: string
  readonly pending: () => string | undefined
  readonly projected: (state: ChatProjectionState) => string | null
  readonly release: () => void
}) {
  if (projected(useChatProjectionStore.getState()) === orderKey) {
    release()

    return
  }

  const unsubscribe = useChatProjectionStore.subscribe((state) => {
    if (pending() !== orderKey) {
      unsubscribe()

      return
    }
    if (projected(state) !== orderKey) return

    unsubscribe()
    release()
  })
}

function withoutKey<TKey extends string>(
  keys: Readonly<Partial<Record<TKey, string>>>,
  key: TKey,
): Partial<Record<TKey, string>> {
  if (!(key in keys)) return keys

  const next = { ...keys }
  delete next[key]

  return next
}
