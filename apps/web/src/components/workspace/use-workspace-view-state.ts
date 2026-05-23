import { useSearchBufferRuntime } from "@/features/search/use-search-buffer"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import type { WorkspacePanelTab } from "@/lib/workspace-cache"
import {
  isCollapsedPanelSize,
  isWorkspacePanelTab,
  workspacePanelSelectionForTabActivation,
  type VisibleTreeItemCountSnapshot,
} from "@/components/workspace/workspace-view-utils"
import {
  type PanelImperativeHandle,
  type PanelSize,
} from "@workspace/ui/components/resizable"
import { useEffect, useRef, useState } from "react"

export function useWorkspaceViewState({
  rootPath,
  treeReady,
}: {
  rootPath: string
  treeReady: boolean
}) {
  const sidebarVisible = useEditorWorkspaceState(
    (state) => state.sidebarVisible
  )
  const workspacePanelTab = useEditorWorkspaceState(
    (state) => state.workspacePanelTab
  )
  const setSidebarVisible = useEditorWorkspaceState(
    (state) => state.setSidebarVisible
  )
  const setWorkspacePanelTab = useEditorWorkspaceState(
    (state) => state.setWorkspacePanelTab
  )
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null)
  const terminalPanelRef = useRef<PanelImperativeHandle | null>(null)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)
  const [visibleTreeItemCount, setVisibleTreeItemCount] =
    useState<VisibleTreeItemCountSnapshot | null>(null)
  const currentVisibleTreeItemCount =
    treeReady && visibleTreeItemCount?.rootPath === rootPath
      ? visibleTreeItemCount.count
      : null

  useSearchBufferRuntime(rootPath)

  useEffect(() => {
    const sidebarPanel = sidebarPanelRef.current
    if (!sidebarPanel) return

    if (sidebarVisible) {
      sidebarPanel.expand()
      return
    }

    sidebarPanel.collapse()
  }, [sidebarVisible])

  function handleWorkspacePanelTabChange(value: string) {
    if (!isWorkspacePanelTab(value)) return

    selectWorkspacePanelTab(value)
  }

  function selectWorkspacePanelTab(tab: WorkspacePanelTab) {
    const nextSelection = workspacePanelSelectionForTabActivation(
      { sidebarVisible, workspacePanelTab },
      tab
    )

    if (nextSelection.workspacePanelTab !== workspacePanelTab) {
      setWorkspacePanelTab(nextSelection.workspacePanelTab)
    }
    if (nextSelection.sidebarVisible !== sidebarVisible) {
      setSidebarVisible(nextSelection.sidebarVisible)
    }
  }

  function handleVisibleTreeItemCountChange(count: number) {
    setVisibleTreeItemCount({ count, rootPath })
  }

  function handleSidebarResize(
    size: PanelSize,
    _id: string | number | undefined,
    previousSize: PanelSize | undefined
  ) {
    if (!previousSize) return

    const nextSidebarVisible = !isCollapsedPanelSize(size)
    if (nextSidebarVisible === sidebarVisible) return

    setSidebarVisible(nextSidebarVisible)
  }

  function handleTerminalResize(size: PanelSize) {
    const nextCollapsed = isCollapsedPanelSize(size)

    setTerminalCollapsed((current) =>
      current === nextCollapsed ? current : nextCollapsed
    )
  }

  function handleToggleTerminal() {
    const nextCollapsed = !terminalCollapsed
    const terminalPanel = terminalPanelRef.current

    setTerminalCollapsed(nextCollapsed)
    if (!terminalPanel) return

    if (nextCollapsed) {
      terminalPanel.collapse()
      return
    }

    terminalPanel.expand()
  }

  return {
    currentVisibleTreeItemCount,
    handleSidebarResize,
    handleTerminalResize,
    handleToggleTerminal,
    handleVisibleTreeItemCountChange,
    handleWorkspacePanelTabChange,
    selectWorkspacePanelTab,
    sidebarPanelRef,
    sidebarVisible,
    terminalCollapsed,
    terminalPanelRef,
    workspacePanelTab,
  }
}
