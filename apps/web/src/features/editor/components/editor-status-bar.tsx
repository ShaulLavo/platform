import type { EditorState } from "@editor/core"
import type {
  TypeScriptLspDiagnosticSummary,
  TypeScriptLspStatus,
} from "@editor/typescript-lsp"
import { AnimatedCounter } from "react-animated-counter"

import {
  formatHistoryStatus,
  formatSyntaxStatus,
  formatTypeScriptLspStatus,
} from "@/features/editor/utils/status-formatters"

export type EditorStatusBarState = {
  charCount: number
  filePath: string
  state: EditorState | null
  typeScriptDiagnostics: TypeScriptLspDiagnosticSummary | null
  typeScriptStatus: TypeScriptLspStatus
}

type EditorStatusBarProps = {
  status: EditorStatusBarState | null
}

const STATUS_COUNTER_CONTAINER_STYLES = {
  display: "inline-flex",
  margin: 0,
} as const

const STATUS_COUNTER_DIGIT_STYLES = {
  fontVariantNumeric: "tabular-nums",
  fontWeight: 500,
} as const

function CounterMetric({
  includeCommas = false,
  label,
  labelPosition = "before",
  value,
}: {
  includeCommas?: boolean
  label: string
  labelPosition?: "before" | "after"
  value: number
}) {
  return (
    <div
      className="inline-flex items-center gap-1"
      aria-label={`${value.toLocaleString()} ${label}`}
    >
      {labelPosition === "before" && <span>{label}</span>}
      <AnimatedCounter
        color="currentColor"
        containerStyles={STATUS_COUNTER_CONTAINER_STYLES}
        decrementColor="currentColor"
        digitStyles={STATUS_COUNTER_DIGIT_STYLES}
        fontSize="11px"
        includeCommas={includeCommas}
        includeDecimals={false}
        incrementColor="currentColor"
        value={value}
      />
      {labelPosition === "after" && <span>{label}</span>}
    </div>
  )
}

function CursorStatus({ state }: { state: EditorState | null }) {
  if (!state?.documentId) return null

  return (
    <span className="inline-flex items-center gap-2">
      <CounterMetric label="Ln" value={state.cursor.row + 1} />
      <CounterMetric label="Col" value={state.cursor.column + 1} />
    </span>
  )
}

export function EditorStatusBar({ status }: EditorStatusBarProps) {
  return (
    <div
      className="flex min-h-7 items-center gap-4 overflow-hidden border-t bg-background px-3 py-1 font-sans text-[11px] whitespace-nowrap text-muted-foreground"
      aria-label="Status bar"
    >
      {status ? <EditorStatusBarContent status={status} /> : null}
    </div>
  )
}

function EditorStatusBarContent({
  status,
}: {
  status: EditorStatusBarState
}) {
  return (
    <>
      <span className="max-w-[40%] min-w-0 truncate text-foreground">
        {status.state?.documentId ? status.filePath : "No file"}
      </span>
      <CursorStatus state={status.state} />
      <CounterMetric
        includeCommas
        label="chars"
        labelPosition="after"
        value={status.charCount}
      />
      <span>{formatSyntaxStatus(status.state)}</span>
      <span>
        {formatTypeScriptLspStatus(
          status.typeScriptStatus,
          status.typeScriptDiagnostics
        )}
      </span>
      <span>{formatHistoryStatus(status.state)}</span>
    </>
  )
}
