import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'

import { useWorkspaceTerminalState } from '@/components/workspace/terminal/hooks/use-workspace-terminal-state'
import {
  clampTerminalHeight,
  COLLAPSE_TERMINAL_HEIGHT,
  DEFAULT_TERMINAL_HEIGHT,
  readPersistedTerminalHeight,
  writePersistedTerminalHeight,
} from '@/components/workspace/terminal/utils/workspace-terminal-height'

/**
 * Tracks the floating terminal's height with localStorage persistence and a
 * pointer-driven resize handle. Move/up listeners are bound to the window only
 * while a drag is active, so hovering the handle never resizes it. Dragging the
 * handle below the collapse threshold hides the terminal.
 */
export function useWorkspaceTerminalHeight(rootPath: string) {
  const setTerminalCollapsed = useWorkspaceTerminalState((state) => state.setTerminalCollapsed)
  const [height, setHeight] = useState(
    () => readPersistedTerminalHeight(rootPath) ?? DEFAULT_TERMINAL_HEIGHT,
  )
  const heightRef = useRef(height)
  heightRef.current = height

  useEffect(() => {
    setHeight(readPersistedTerminalHeight(rootPath) ?? DEFAULT_TERMINAL_HEIGHT)
  }, [rootPath])

  const onResizePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()

      const startY = event.clientY
      const startHeight = heightRef.current
      const boundsHeight =
        event.currentTarget.closest('[data-terminal-overlay-bounds]')?.getBoundingClientRect()
          .height ?? window.innerHeight

      function endDrag() {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        document.body.style.removeProperty('user-select')
      }

      function handleMove(moveEvent: globalThis.PointerEvent) {
        const rawHeight = startHeight + (startY - moveEvent.clientY)

        if (rawHeight < COLLAPSE_TERMINAL_HEIGHT) {
          endDrag()
          setTerminalCollapsed(true)

          return
        }

        setHeight(clampTerminalHeight(rawHeight, boundsHeight))
      }

      function handleUp() {
        endDrag()
        writePersistedTerminalHeight(rootPath, heightRef.current)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      document.body.style.userSelect = 'none'
    },
    [rootPath, setTerminalCollapsed],
  )

  return { height, onResizePointerDown }
}
