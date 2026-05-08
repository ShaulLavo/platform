import type { EditorState } from "@editor/core"
import type {
  TypeScriptLspDiagnosticSummary,
  TypeScriptLspStatus,
} from "@editor/typescript-lsp"

import Counter from "@/components/react-bits/counter"
import {
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

function wholeNumberPlaces(value: number) {
  const digitCount = Math.max(1, Math.floor(value).toString().length)

  return Array.from({ length: digitCount }, (_, index) => {
    return 10 ** (digitCount - index - 1)
  })
}

function CursorMetric({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${label} ${value}`}>
      <span>{label}</span>
      <Counter
        digitPlaceHolders={false}
        fontSize={11}
        fontWeight={500}
        gap={1}
        gradientFrom="var(--background)"
        gradientHeight={3}
        horizontalPadding={0}
        places={wholeNumberPlaces(value)}
        textColor="currentColor"
        value={value}
      />
    </span>
  )
}

function CursorStatus({ state }: { state: EditorState | null }) {
  if (!state?.documentId) return null

  return (
    <span className="inline-flex items-center gap-2">
      <CursorMetric label="Ln" value={state.cursor.row + 1} />
      <CursorMetric label="Col" value={state.cursor.column + 1} />
    </span>
  )
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
      <CursorStatus state={state} />
      <span>{text.length.toLocaleString()} chars</span>
      <span>{formatSyntaxStatus(state)}</span>
      <span>
        {formatTypeScriptLspStatus(typeScriptStatus, typeScriptDiagnostics)}
      </span>
      <span>{formatHistoryStatus(state)}</span>
    </div>
  )
}
