import { createEnvironmentEntry } from '@workspace/client-core/environments/utils/connection'
import type { EnvironmentId } from '@workspace/contracts'
import {
  activeServerOrigin,
  getClient,
  setActiveServerOrigin,
  setClient,
  type Client,
} from '@/lib/client'
import { queryClientFor } from '@/lib/environments/state/query-clients'
import { useEnvironmentsStore } from '@/lib/environments/state/store'

export function scopeAddressEnvironment(
  origin: string,
  environmentId: EnvironmentId,
  client: Client,
) {
  const previousOrigin = activeServerOrigin()
  const previousEnvironments = useEnvironmentsStore.getState()
  setActiveServerOrigin(origin)
  const previousClient = getClient()
  setClient(client)
  useEnvironmentsStore.setState({
    activeOrigin: origin,
    entries: { [origin]: { ...createEnvironmentEntry(origin, origin), environmentId } },
    connectionByOrigin: {},
  })
  return () => {
    queryClientFor(origin).clear()
    setActiveServerOrigin(origin)
    setClient(previousClient)
    setActiveServerOrigin(previousOrigin)
    useEnvironmentsStore.setState(previousEnvironments, true)
  }
}
