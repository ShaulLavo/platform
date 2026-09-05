import { useStore } from 'zustand'
import {
  createEnvironmentsStore,
  type EnvironmentsStore,
} from '@workspace/client-core/environments/state/store'
import { activeServerOrigin, setActiveServerOrigin } from '@/lib/client'

const store = createEnvironmentsStore({ primaryOrigin: activeServerOrigin() })
const activate = store.getState().activate

store.setState({
  activate(origin) {
    setActiveServerOrigin(origin)
    activate(origin)
  },
})

export const useEnvironmentsStore = Object.assign(
  <T>(selector: (state: EnvironmentsStore) => T) => useStore(store, selector),
  store,
)

export function resetServerConnectionStore(origin?: string): void {
  store.getState().resetConnections(origin)
}
