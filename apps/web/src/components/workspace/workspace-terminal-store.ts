import { isCollapsedPanelSize } from '@/components/workspace/workspace-view-utils'
import { type PanelImperativeHandle, type PanelSize } from '@workspace/ui/components/resizable'
import { type RefObject } from 'react'
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

export type WorkspaceTerminalStore = WorkspaceTerminalStoreState & WorkspaceTerminalStoreActions

export type WorkspaceTerminalStoreApi = StoreApi<WorkspaceTerminalStore>

export function createWorkspaceTerminalStore() {
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
