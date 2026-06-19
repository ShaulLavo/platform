import { EditorHost } from '@singapor/react'
import { memo, type ComponentProps, type ReactNode } from 'react'

type EditorFrameProps = {
  active: boolean
  controller: ComponentProps<typeof EditorHost>['controller']
  onActivate: () => void
  children?: ReactNode
}

export const EditorFrame = memo(
  ({ active, controller, onActivate, children }: EditorFrameProps) => {
    return (
      <div
        className='flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden'
        data-editor-focus-active={active ? 'true' : 'false'}
        data-native-window-drag-blocker=''
        onFocusCapture={onActivate}
        onPointerDownCapture={onActivate}
      >
        <EditorHost className='app-editor-host' controller={controller} />
        {children}
      </div>
    )
  },
)
