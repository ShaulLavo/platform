import { createStore, type StoreApi } from 'zustand/vanilla'

export type TerminalTab = {
  id: string
  title: string
}

type TerminalStoreState = {
  activeTerminalTabId: string
  nextTerminalTabIndex: number
  terminalCollapsed: boolean
  terminalTabs: TerminalTab[]
}

type TerminalStoreActions = {
  closeTerminalTab: (tabId: string) => void
  createTerminalTab: () => TerminalTab
  setActiveTerminalTabId: (tabId: string) => void
  setTerminalCollapsed: (collapsed: boolean) => void
  toggleTerminal: () => void
}

export type TerminalStore = TerminalStoreState & TerminalStoreActions

export type TerminalStoreApi = StoreApi<TerminalStore>

const INITIAL_TERMINAL_TAB: TerminalTab = {
  id: 'terminal-1',
  title: '1',
}

export function createTerminalStore() {
  return createStore<TerminalStore>()((set, get) => ({
    activeTerminalTabId: INITIAL_TERMINAL_TAB.id,
    nextTerminalTabIndex: 2,
    terminalCollapsed: false,
    terminalTabs: [INITIAL_TERMINAL_TAB],
    setTerminalCollapsed: (terminalCollapsed) =>
      set((state) => {
        if (state.terminalCollapsed === terminalCollapsed) return state

        return { terminalCollapsed }
      }),
    setActiveTerminalTabId: (activeTerminalTabId) =>
      set((state) => {
        if (state.activeTerminalTabId === activeTerminalTabId) return state
        if (!state.terminalTabs.some((tab) => tab.id === activeTerminalTabId)) return state

        return { activeTerminalTabId }
      }),
    createTerminalTab: () => {
      const tab = nextTerminalTab(get().nextTerminalTabIndex)

      set((state) => ({
        activeTerminalTabId: tab.id,
        nextTerminalTabIndex: state.nextTerminalTabIndex + 1,
        terminalCollapsed: false,
        terminalTabs: [...state.terminalTabs, tab],
      }))

      return tab
    },
    closeTerminalTab: (tabId) =>
      set((state) => {
        if (state.terminalTabs.length <= 1) return state

        const tabIndex = state.terminalTabs.findIndex((tab) => tab.id === tabId)
        if (tabIndex === -1) return state

        const terminalTabs = state.terminalTabs.filter((tab) => tab.id !== tabId)
        const activeTerminalTabId =
          state.activeTerminalTabId === tabId
            ? replacementActiveTerminalTabId(terminalTabs, tabIndex)
            : state.activeTerminalTabId

        return {
          activeTerminalTabId,
          terminalTabs,
        }
      }),
    toggleTerminal: () => {
      get().setTerminalCollapsed(!get().terminalCollapsed)
    },
  }))
}

function nextTerminalTab(index: number) {
  return {
    id: `terminal-${index}`,
    title: String(index),
  }
}

function replacementActiveTerminalTabId(tabs: readonly TerminalTab[], closedIndex: number) {
  return tabs[Math.min(closedIndex, tabs.length - 1)]?.id ?? INITIAL_TERMINAL_TAB.id
}
