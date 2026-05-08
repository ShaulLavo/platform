import type { EditorState } from "@editor/core"
import type {
  TypeScriptLspDiagnosticSummary,
  TypeScriptLspStatus,
} from "@editor/typescript-lsp"

import {
  formatCursorStatus,
  formatHistoryStatus,
  formatSyntaxStatus,
  formatTypeScriptLspStatus,
} from "@/components/editor/status-formatters"

type EditorStatusBarProps = {
  filePath: string
  state: EditorState | null
  text: string
  typeScriptDiagnostics: TypeScriptLspDiagnosticSummary | null
  typeScriptStatus: TypeScriptLspStatus
}

export function EditorStatusBar({
  filePath,
  state,
  text,
  typeScriptDiagnostics,
  typeScriptStatus,
}: EditorStatusBarProps) {
  return (
    <div className="flex min-h-7 items-center gap-4 overflow-hidden border-t bg-background px-3 py-1 font-sans text-[11px] whitespace-nowrap text-muted-foreground">
      <span className="max-w-[40%] min-w-0 truncate text-foreground">
        {state?.documentId ? filePath : "No file"}
      </span>
      <span>{formatCursorStatus(state)}</span>
      <span>{text.length.toLocaleString()} chars</span>
      <span>{formatSyntaxStatus(state)}</span>
      <span>
        {formatTypeScriptLspStatus(typeScriptStatus, typeScriptDiagnostics)}
      </span>
      <span>{formatHistoryStatus(state)}</span>
    </div>
  )
}
