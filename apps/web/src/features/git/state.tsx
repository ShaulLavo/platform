import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi as ZustandStoreApi } from "zustand/vanilla"

import type { PanelSection } from "./types"

type StoreState = {
  commitMessage: string
  sectionOpen: Record<PanelSection, boolean>
}

type StoreActions = {
  resetCommitMessage: () => void
  setCommitMessage: (message: string) => void
  setSectionOpen: (section: PanelSection, open: boolean) => void
}

export type GitStore = StoreState & StoreActions

export type GitStoreApi = ZustandStoreApi<GitStore>

export const StateContext = createContext<GitStoreApi | null>(null)

export function useGitState<T>(selector: (state: GitStore) => T): T {
  const store = useContext(StateContext)
  if (!store) {
    throw new Error("useGitState must be used within GitStateProvider")
  }

  return useStore(store, selector)
}

export function createGitStore() {
  return createStore<GitStore>()((set) => ({
    commitMessage: "",
    sectionOpen: {
      staged: true,
      worktree: true,
    },
    resetCommitMessage: () => set({ commitMessage: "" }),
    setCommitMessage: (commitMessage) => set({ commitMessage }),
    setSectionOpen: (section, open) =>
      set((state) => ({
        sectionOpen: {
          ...state.sectionOpen,
          [section]: open,
        },
      })),
  }))
}
