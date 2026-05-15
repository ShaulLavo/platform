import {
  parseTerminalServerMessage,
  type TerminalServerMessage,
} from "@workspace/contracts"
import { cn } from "@workspace/ui/lib/utils"
import { FitAddon, init, Terminal, type IDisposable } from "ghostty-web"
import { useEffect, useRef, useState } from "react"

import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import { reportError, toClientError } from "@/lib/client-error-taxonomy"

import {
  sendTerminalClientMessage,
  terminalSocketUrl,
} from "./terminal-socket"

type TerminalConnectionStatus =
  | "closed"
  | "connected"
  | "connecting"
  | "error"
  | "initializing"

type TerminalDimensions = {
  cols: number
  rows: number
}

const TERMINAL_THEME = {
  background: "#101214",
  foreground: "#d7dde5",
  cursor: "#f4f7fb",
  cursorAccent: "#101214",
  selectionBackground: "#3d5368",
  selectionForeground: "#ffffff",
  black: "#15181c",
  red: "#ff5f57",
  green: "#5fd38d",
  yellow: "#f3c969",
  blue: "#6aa8ff",
  magenta: "#d28bff",
  cyan: "#5fd7e5",
  white: "#d7dde5",
  brightBlack: "#6d7682",
  brightRed: "#ff8f87",
  brightGreen: "#89e8af",
  brightYellow: "#f7d98c",
  brightBlue: "#93c1ff",
  brightMagenta: "#e1b0ff",
  brightCyan: "#8ce8f0",
  brightWhite: "#ffffff",
}

let ghosttyInitPromise: Promise<void> | null = null

export function TerminalPanel({
  className,
  rootPath,
}: {
  className?: string
  rootPath: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const [detail, setDetail] = useState("Starting")
  const [status, setStatus] =
    useState<TerminalConnectionStatus>("initializing")

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    return mountTerminal({
      host,
      rootPath,
      setDetail,
      setStatus,
    })
  }, [rootPath])

  return (
    <section
      aria-label="Terminal"
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-rows-[32px_minmax(0,1fr)] overflow-hidden bg-[#101214] text-[#d7dde5]",
        className
      )}
      onFocusCapture={() => setFocusArea("terminal")}
      onPointerDownCapture={() => setFocusArea("terminal")}
    >
      <TerminalPanelHeader detail={detail} status={status} />
      <div
        className="min-h-0 min-w-0 overflow-hidden bg-[#101214] px-2 py-1 font-mono"
        ref={hostRef}
      />
    </section>
  )
}

function TerminalPanelHeader({
  detail,
  status,
}: {
  detail: string
  status: TerminalConnectionStatus
}) {
  return (
    <div className="flex min-w-0 items-center justify-between border-b border-white/10 bg-[#15181c] px-3 text-[11px]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="font-medium tracking-normal text-[#f4f7fb]">
          Terminal
        </span>
        <span className="truncate text-[#9aa6b2]">{detail}</span>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-[#9aa6b2]">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            terminalStatusDotClassName(status)
          )}
        />
        {terminalStatusLabel(status)}
      </span>
    </div>
  )
}

function mountTerminal({
  host,
  rootPath,
  setDetail,
  setStatus,
}: {
  host: HTMLDivElement
  rootPath: string
  setDetail: (detail: string) => void
  setStatus: (status: TerminalConnectionStatus) => void
}) {
  let cancelled = false
  let dataDisposable: IDisposable | null = null
  let fitAddon: FitAddon | null = null
  let resizeDisposable: IDisposable | null = null
  let socket: WebSocket | null = null
  let terminal: Terminal | null = null
  let terminalDimensions: TerminalDimensions | null = null

  setStatus("initializing")
  setDetail("Loading")

  void initializeGhostty()
    .then(() => {
      if (cancelled) return

      terminal = createTerminal()
      fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(host)
      fitAddon.fit()
      terminalDimensions = currentTerminalDimensions(terminal)
      fitAddon.observeResize()
      terminal.focus()
      dataDisposable = terminal.onData((data) =>
        sendTerminalClientMessage(socket, { type: "input", data })
      )
      resizeDisposable = terminal.onResize((dimensions) => {
        terminalDimensions = dimensions
        sendTerminalResize(socket, dimensions)
      })
      socket = connectTerminalSocket({
        getTerminalDimensions: () => terminalDimensions,
        isCancelled: () => cancelled,
        rootPath,
        setDetail,
        setStatus,
        terminal,
      })
    })
    .catch((error: unknown) => {
      if (cancelled) return

      setStatus("error")
      setDetail("Could not load")
      reportError(toClientError(error))
    })

  return () => {
    cancelled = true
    dataDisposable?.dispose()
    resizeDisposable?.dispose()
    fitAddon?.dispose()
    terminal?.dispose()
    closeTerminalSocket(socket)
    host.replaceChildren()
  }
}

function connectTerminalSocket({
  getTerminalDimensions,
  isCancelled,
  rootPath,
  setDetail,
  setStatus,
  terminal,
}: {
  getTerminalDimensions: () => TerminalDimensions | null
  isCancelled: () => boolean
  rootPath: string
  setDetail: (detail: string) => void
  setStatus: (status: TerminalConnectionStatus) => void
  terminal: Terminal
}) {
  const socket = new WebSocket(terminalSocketUrl(rootPath))
  setStatus("connecting")
  setDetail("Connecting")

  socket.addEventListener("open", () => {
    if (isCancelled()) return

    setStatus("connected")
    setDetail("Connected")
    sendTerminalResize(socket, getTerminalDimensions())
  })
  socket.addEventListener("message", (event) => {
    if (isCancelled()) return

    const message = parseTerminalServerMessage(event.data)
    if (!message) return

    handleTerminalServerMessage({
      message,
      setDetail,
      setStatus,
      terminal,
    })
  })
  socket.addEventListener("error", () => {
    if (isCancelled()) return

    setStatus("error")
    setDetail("Socket error")
  })
  socket.addEventListener("close", () => {
    if (isCancelled()) return

    setStatus("closed")
    setDetail("Closed")
  })

  return socket
}

function handleTerminalServerMessage({
  message,
  setDetail,
  setStatus,
  terminal,
}: {
  message: TerminalServerMessage
  setDetail: (detail: string) => void
  setStatus: (status: TerminalConnectionStatus) => void
  terminal: Terminal
}) {
  if (message.type === "output") {
    terminal.write(message.data)
    return
  }
  if (message.type === "ready") {
    setStatus("connected")
    setDetail(shellDetail(message.shell, message.cwd))
    return
  }
  if (message.type === "exit") {
    setStatus("closed")
    setDetail(exitDetail(message.exitCode))
    terminal.writeln("")
    terminal.writeln(exitDetail(message.exitCode))
    return
  }

  setStatus("error")
  setDetail(message.message)
  terminal.writeln("")
  terminal.writeln(message.message)
}

function createTerminal() {
  return new Terminal({
    cursorBlink: true,
    cursorStyle: "block",
    fontFamily:
      "'JetBrains Mono Variable', ui-monospace, SFMono-Regular, monospace",
    fontSize: 12,
    scrollback: 10_000,
    smoothScrollDuration: 80,
    theme: TERMINAL_THEME,
  })
}

function currentTerminalDimensions(terminal: Terminal) {
  return {
    cols: terminal.cols,
    rows: terminal.rows,
  }
}

function initializeGhostty() {
  ghosttyInitPromise ??= init()
  return ghosttyInitPromise
}

function sendTerminalResize(
  socket: WebSocket | null,
  dimensions: TerminalDimensions | null
) {
  if (!dimensions) return false

  return sendTerminalClientMessage(socket, {
    cols: dimensions.cols,
    rows: dimensions.rows,
    type: "resize",
  })
}

function closeTerminalSocket(socket: WebSocket | null) {
  if (!socket) return
  if (socket.readyState === WebSocket.CLOSED) return
  if (socket.readyState === WebSocket.CLOSING) return

  socket.close()
}

function shellDetail(shell: string, cwd: string) {
  return `${shellName(shell)} in ${cwd}`
}

function shellName(shell: string) {
  return shell.split("/").filter(Boolean).at(-1) ?? shell
}

function exitDetail(exitCode: number | null) {
  if (exitCode === null) return "Process exited"

  return `Process exited ${exitCode}`
}

function terminalStatusDotClassName(status: TerminalConnectionStatus) {
  if (status === "connected") return "bg-[#5fd38d]"
  if (status === "error") return "bg-[#ff5f57]"
  if (status === "closed") return "bg-[#6d7682]"

  return "bg-[#f3c969]"
}

function terminalStatusLabel(status: TerminalConnectionStatus) {
  if (status === "initializing") return "Loading"
  if (status === "connecting") return "Connecting"
  if (status === "connected") return "Ready"
  if (status === "error") return "Error"

  return "Closed"
}
