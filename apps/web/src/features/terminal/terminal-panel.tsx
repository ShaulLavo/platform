import {
  parseTerminalServerMessage,
  type TerminalServerMessage,
} from "@workspace/contracts"
import { cn } from "@workspace/ui/lib/utils"
import { FitAddon, init, Terminal, type IDisposable } from "ghostty-web"
import { useEffect, useRef } from "react"

import { useWorkspaceFocus } from "@/components/workspace/workspace-focus-state"
import { reportError, toClientError } from "@/lib/client-error-taxonomy"

import {
  sendTerminalClientMessage,
  terminalSocketUrl,
} from "./terminal-socket"

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

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    return mountTerminal({
      host,
      rootPath,
    })
  }, [rootPath])

  return (
    <section
      aria-label="Terminal"
      className={cn(
        "grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden bg-[#101214] text-[#d7dde5]",
        className
      )}
      onFocusCapture={() => setFocusArea("terminal")}
      onPointerDownCapture={() => setFocusArea("terminal")}
    >
      <div
        className="min-h-0 min-w-0 overflow-hidden bg-[#101214] px-2 py-1 font-mono"
        ref={hostRef}
      />
    </section>
  )
}

function mountTerminal({
  host,
  rootPath,
}: {
  host: HTMLDivElement
  rootPath: string
}) {
  let cancelled = false
  let dataDisposable: IDisposable | null = null
  let fitAddon: FitAddon | null = null
  let resizeDisposable: IDisposable | null = null
  let socket: WebSocket | null = null
  let terminal: Terminal | null = null
  let terminalDimensions: TerminalDimensions | null = null

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
        terminal,
      })
    })
    .catch((error: unknown) => {
      if (cancelled) return

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
  terminal,
}: {
  getTerminalDimensions: () => TerminalDimensions | null
  isCancelled: () => boolean
  rootPath: string
  terminal: Terminal
}) {
  const socket = new WebSocket(terminalSocketUrl(rootPath))

  socket.addEventListener("open", () => {
    if (isCancelled()) return

    sendTerminalResize(socket, getTerminalDimensions())
  })
  socket.addEventListener("message", (event) => {
    if (isCancelled()) return

    const message = parseTerminalServerMessage(event.data)
    if (!message) return

    handleTerminalServerMessage({
      message,
      terminal,
    })
  })

  return socket
}

function handleTerminalServerMessage({
  message,
  terminal,
}: {
  message: TerminalServerMessage
  terminal: Terminal
}) {
  if (message.type === "output") {
    terminal.write(message.data)
    return
  }
  if (message.type === "ready") {
    return
  }
  if (message.type === "exit") {
    terminal.writeln("")
    terminal.writeln(exitDetail(message.exitCode))
    return
  }

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

function exitDetail(exitCode: number | null) {
  if (exitCode === null) return "Process exited"

  return `Process exited ${exitCode}`
}
