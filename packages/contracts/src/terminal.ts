import { isRecord } from "./is-record"

export const TERMINAL_MIN_COLS = 2
export const TERMINAL_MAX_COLS = 500
export const TERMINAL_MIN_ROWS = 1
export const TERMINAL_MAX_ROWS = 200

export type TerminalClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }

export type TerminalServerMessage =
  | { type: "ready"; shell: string; cwd: string }
  | { type: "output"; data: string }
  | { type: "exit"; exitCode: number | null }
  | { type: "error"; message: string }

export function parseTerminalClientMessage(
  value: unknown
): TerminalClientMessage | null {
  const parsed = parseJsonValue(value)
  if (!isRecord(parsed)) return null
  if (parsed.type === "input") return terminalInputMessage(parsed)
  if (parsed.type === "resize") return terminalResizeMessage(parsed)

  return null
}

export function parseTerminalServerMessage(
  value: unknown
): TerminalServerMessage | null {
  const parsed = parseJsonValue(value)
  if (!isRecord(parsed)) return null
  if (parsed.type === "ready") return terminalReadyMessage(parsed)
  if (parsed.type === "output") return terminalOutputMessage(parsed)
  if (parsed.type === "exit") return terminalExitMessage(parsed)
  if (parsed.type === "error") return terminalErrorMessage(parsed)

  return null
}

export function normalizeTerminalCols(value: unknown) {
  return normalizeTerminalDimension(
    value,
    TERMINAL_MIN_COLS,
    TERMINAL_MAX_COLS
  )
}

export function normalizeTerminalRows(value: unknown) {
  return normalizeTerminalDimension(
    value,
    TERMINAL_MIN_ROWS,
    TERMINAL_MAX_ROWS
  )
}

function terminalInputMessage(
  value: Record<string, unknown>
): TerminalClientMessage | null {
  if (typeof value.data !== "string") return null

  return { type: "input", data: value.data }
}

function terminalResizeMessage(
  value: Record<string, unknown>
): TerminalClientMessage | null {
  const cols = normalizeTerminalCols(value.cols)
  const rows = normalizeTerminalRows(value.rows)
  if (cols === null || rows === null) return null

  return { type: "resize", cols, rows }
}

function terminalReadyMessage(
  value: Record<string, unknown>
): TerminalServerMessage | null {
  if (typeof value.shell !== "string") return null
  if (typeof value.cwd !== "string") return null

  return { type: "ready", shell: value.shell, cwd: value.cwd }
}

function terminalOutputMessage(
  value: Record<string, unknown>
): TerminalServerMessage | null {
  if (typeof value.data !== "string") return null

  return { type: "output", data: value.data }
}

function terminalExitMessage(
  value: Record<string, unknown>
): TerminalServerMessage | null {
  if (value.exitCode !== null && typeof value.exitCode !== "number")
    return null
  if (typeof value.exitCode === "number" && !Number.isFinite(value.exitCode))
    return null

  return { type: "exit", exitCode: value.exitCode }
}

function terminalErrorMessage(
  value: Record<string, unknown>
): TerminalServerMessage | null {
  if (typeof value.message !== "string") return null

  return { type: "error", message: value.message }
}

function normalizeTerminalDimension(
  value: unknown,
  min: number,
  max: number
) {
  if (typeof value !== "number") return null
  if (!Number.isFinite(value)) return null

  return Math.max(min, Math.min(max, Math.floor(value)))
}

function parseJsonValue(value: unknown) {
  if (typeof value !== "string") return value

  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}
