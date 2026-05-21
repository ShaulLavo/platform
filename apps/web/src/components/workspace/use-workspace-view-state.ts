import { useSearchBufferRuntime } from "@/features/search/use-search-buffer"
import { useEditorWorkspaceState } from "@/features/editor/state/editor-workspace-state"
import type { WorkspacePanelTab } from "@/lib/workspace-cache"
import {
  isCollapsedPanelSize,
  isWorkspacePanelTab,
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
    setWorkspacePanelTab(tab)
    if (sidebarVisible) return

    setSidebarVisible(true)
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

  return {
    currentVisibleTreeItemCount,
    handleSidebarResize,
    handleTerminalResize,
    handleVisibleTreeItemCountChange,
    handleWorkspacePanelTabChange,
    selectWorkspacePanelTab,
    sidebarPanelRef,
    sidebarVisible,
    terminalCollapsed,
    workspacePanelTab,
  }
}
