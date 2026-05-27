import { isCollapsedPanelSize } from '@/components/workspace/workspace-view-utils'
import { type PanelImperativeHandle, type PanelSize } from '@workspace/ui/components/resizable'
import { useCallback, useRef, useState } from 'react'

export function useWorkspaceTerminalState() {
  const terminalPanelRef = useRef<PanelImperativeHandle | null>(null)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)

  const handleTerminalResize = useCallback(function handleTerminalResize(size: PanelSize) {
    const nextCollapsed = isCollapsedPanelSize(size)

    setTerminalCollapsed((current) => (current === nextCollapsed ? current : nextCollapsed))
  }, [])

  const handleToggleTerminal = useCallback(
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
    },
    [terminalCollapsed],
  )

  return {
    handleTerminalResize,
    handleToggleTerminal,
    terminalCollapsed,
    terminalPanelRef,
  }
}
