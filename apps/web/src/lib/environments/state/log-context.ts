import { activeServerOrigin, originForClient, type Client } from '@/lib/client'
import { useEnvironmentsStore } from '@/lib/environments/state/store'

export function environmentLogContext(origin = activeServerOrigin()) {
  const entry = useEnvironmentsStore.getState().entries[origin]
  return { environmentId: entry?.environmentId ?? null, machine: entry?.name ?? null }
}

export function eventLogContext(event: Readonly<Record<string, unknown>>) {
  const context = Object.hasOwn(event, 'environmentId')
    ? contextForEnvironmentId(event.environmentId)
    : environmentLogContext()
  return {
    ...context,
    machine: Object.hasOwn(event, 'machine') ? event.machine : context.machine,
  }
}

function contextForEnvironmentId(environmentId: unknown) {
  const entries = Object.values(useEnvironmentsStore.getState().entries)
  const matches = entries.filter(
    (entry) => entry.environmentId !== null && entry.environmentId === environmentId,
  )
  const entry = matches.find((entry) => entry.kind === 'primary') ?? matches[0]
  return { environmentId, machine: entry?.name ?? null }
}

export function clientLogContext(client: Client) {
  const origin = originForClient(client)
  if (!origin) return { environmentId: null, machine: null }
  return environmentLogContext(origin)
}
