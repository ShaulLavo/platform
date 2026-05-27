import { isCollapsedPanelSize } from '@/components/workspace/workspace-view-utils'
import { clientErrors } from '@/lib/structured-errors'
import { type PanelImperativeHandle, type PanelSize } from '@workspace/ui/components/resizable'
import {
  createContext,
  createElement,
  use,
  useRef,
  type RefObject,
  type ReactNode,
} from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

type WorkspaceTerminalStoreState = {
  terminalCollapsed: boolean
  terminalPanelRef: RefObject<PanelImperativeHandle | null>
}

type WorkspaceTerminalStoreActions = {
  handleTerminalResize: (size: PanelSize) => void
  setTerminalCollapsed: (collapsed: boolean) => void
  toggleTerminal: () => void
}

type WorkspaceTerminalStore = WorkspaceTerminalStoreState & WorkspaceTerminalStoreActions

type WorkspaceTerminalStoreApi = StoreApi<WorkspaceTerminalStore>

const WorkspaceTerminalStateContext = createContext<WorkspaceTerminalStoreApi | null>(null)

export function WorkspaceTerminalStateProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<WorkspaceTerminalStoreApi | null>(null)
  storeRef.current ??= createWorkspaceTerminalStore()

  return createElement(
    WorkspaceTerminalStateContext.Provider,
    { value: storeRef.current },
    children,
  )
}

export function useWorkspaceTerminalState<T>(selector: (state: WorkspaceTerminalStore) => T): T {
  return useStore(useWorkspaceTerminalStoreApi(), selector)
}

export function useWorkspaceTerminalCollapsed() {
  return useWorkspaceTerminalState((state) => state.terminalCollapsed)
}

export function useWorkspaceTerminalPanelRef() {
  return useWorkspaceTerminalState((state) => state.terminalPanelRef)
}

export function useWorkspaceTerminalResizeHandler() {
  return useWorkspaceTerminalState((state) => state.handleTerminalResize)
}

export function useWorkspaceTerminalToggle() {
  return useWorkspaceTerminalState((state) => state.toggleTerminal)
}

function createWorkspaceTerminalStore() {
  const terminalPanelRef: RefObject<PanelImperativeHandle | null> = {
    current: null,
  }

  return createStore<WorkspaceTerminalStore>()((set, get) => ({
    terminalCollapsed: false,
    terminalPanelRef,
    handleTerminalResize: (size) => {
      get().setTerminalCollapsed(isCollapsedPanelSize(size))
    },
    setTerminalCollapsed: (terminalCollapsed) =>
      set((state) => {
        if (state.terminalCollapsed === terminalCollapsed) return state

        return { terminalCollapsed }
      }),
    toggleTerminal: () => {
      const nextCollapsed = !get().terminalCollapsed
      const terminalPanel = terminalPanelRef.current

      get().setTerminalCollapsed(nextCollapsed)
      if (!terminalPanel) return

      if (nextCollapsed) {
        terminalPanel.collapse()
        return
      }

      terminalPanel.expand()
    },
  }))
}

function useWorkspaceTerminalStoreApi() {
  const store = use(WorkspaceTerminalStateContext)
  if (!store) {
    throw clientErrors.CONTEXT_MISSING({
      message: 'useWorkspaceTerminalState must be used within WorkspaceTerminalStateProvider',
    })
  }

  return store
}
