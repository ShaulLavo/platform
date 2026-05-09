import { EditorHost } from "@editor/react"
import type { ComponentProps, ReactNode } from "react"

type EditorFrameProps = {
  active: boolean
  controller: ComponentProps<typeof EditorHost>["controller"]
  onActivate: () => void
  children?: ReactNode
}

export function EditorFrame({
  active,
  controller,
  onActivate,
  children,
}: EditorFrameProps) {
  return (
    <div
      className="flex h-full w-full min-w-0 flex-1 bg-background"
      data-editor-focus-active={active ? "true" : "false"}
      onFocusCapture={onActivate}
      onPointerDownCapture={onActivate}
    >
      <EditorHost className="app-editor-host" controller={controller} />
      {children}
    </div>
  )
}
