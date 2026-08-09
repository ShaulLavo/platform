import { EditorHost } from '@singapor/react'
import {
  memo,
  type ComponentProps,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'

import { EditorTextMenu } from '@/features/editor/components/text-menu'
import { useContextMenu } from '@/features/menus/hooks/use-context-menu'

type EditorFrameProps = {
  active: boolean
  controller: ComponentProps<typeof EditorHost>['controller']
  onActivate: () => void
  children?: ReactNode
}

export const EditorFrame = memo(
  ({ active, controller, onActivate, children }: EditorFrameProps) => {
    const contextMenu = useContextMenu()

    // `contextmenu` bubbles out of the editor's own DOM, so the frame is the
    // one element we own that sees every right-click inside the editor.
    function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
      contextMenu.openAtEvent(event, event.currentTarget)
    }

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      contextMenu.openOnMenuKey(event)
    }

    return (
      <div
        className='flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden'
        data-editor-focus-active={active ? 'true' : 'false'}
        onContextMenu={handleContextMenu}
        onFocusCapture={onActivate}
        onKeyDown={handleKeyDown}
        onPointerDownCapture={onActivate}
      >
        <EditorHost className='app-editor-host' controller={controller} />
        {children}
        {contextMenu.anchor ? (
          <EditorTextMenu anchor={contextMenu.anchor} onOpenChange={contextMenu.onOpenChange} />
        ) : null}
      </div>
    )
  },
)
