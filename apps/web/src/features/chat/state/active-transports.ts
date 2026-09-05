import { useChatProjectionStore } from '@/features/chat/state/chat-projection-store'
import {
  orchestrationDispatchResultSchema,
  orchestrationShellSnapshotSchema,
  type ClientOrchestrationCommand,
} from '@workspace/contracts'
import * as v from 'valibot'
import { environmentClientFor } from '@/lib/client'
import { confirmedEnvironmentId, confirmedEnvironmentOrigin } from '@/lib/environments/state/domain'
import { unwrapEdenResponse } from '@/lib/eden-events'
import type { EnvironmentId } from '@workspace/contracts'
import type { ChatTransport } from '@/features/chat/transport/chat-transport'
import { resetSessionEarlierPageStore } from '@/features/chat/state/session-earlier-page-store'

const activeTransports = new Set<ChatTransport>()
let projectionOrigin: string | null = null

export function registerActiveChatTransport(origin: string, transport: ChatTransport) {
  if (projectionOrigin !== null && projectionOrigin !== origin) {
    closeChatTransportsForEnvironmentSwitch()
  }
  projectionOrigin = origin
  activeTransports.add(transport)
  return () => {
    activeTransports.delete(transport)
    transport.close()
  }
}

export function closeChatTransportsForEnvironmentSwitch() {
  for (const transport of activeTransports) {
    transport.close()
  }
  activeTransports.clear()
  projectionOrigin = null
  resetSessionEarlierPageStore()
}

export async function dispatchCommandForEnvironment(
  environmentId: EnvironmentId,
  command: ClientOrchestrationCommand,
) {
  const origin = confirmedEnvironmentOrigin(environmentId)
  const client = environmentClientFor(origin)
  const response = await client.orchestration.commands.post(command)
  confirmedEnvironmentId(origin)
  const receipt = v.parse(
    orchestrationDispatchResultSchema,
    unwrapEdenResponse(response, {
      requireData: true,
      normalizeDates: true,
      emptyMessage: 'The session command returned no receipt.',
    }),
  )
  if (
    Array.from(activeTransports).some(
      (transport) => transport.environmentId === environmentId && !transport.closed,
    )
  )
    return receipt

  const snapshotResponse = await client.orchestration['shell-snapshot'].get()
  const snapshot = v.parse(
    orchestrationShellSnapshotSchema,
    unwrapEdenResponse(snapshotResponse, {
      requireData: true,
      normalizeDates: true,
      emptyMessage: 'The session machine returned no workspace snapshot.',
    }),
  )
  confirmedEnvironmentId(origin)
  useChatProjectionStore.getState().syncShellSnapshot(environmentId, snapshot)
  return receipt
}
