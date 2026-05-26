import type { ReactEditorController } from '@editor/react'

import { useEditorSyntaxStatus } from '@/features/editor/hooks/use-editor-syntax-status'

type EditorStatusSyntaxProps = {
  controller: ReactEditorController
}

export function EditorStatusSyntax({ controller }: EditorStatusSyntaxProps) {
  const syntaxStatus = useEditorSyntaxStatus(controller)

  return <span>{syntaxStatus}</span>
}
