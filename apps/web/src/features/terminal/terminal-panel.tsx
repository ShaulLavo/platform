import { parseTerminalServerMessage, type TerminalServerMessage } from '@workspace/contracts'
import { cn } from '@workspace/ui/lib/utils'
import { FitAddon, init, Terminal, type IDisposable } from 'ghostty-web'
import {
  useEffect,
  useEffectEvent,
  useRef,
  type ComponentPropsWithoutRef,
  type FocusEvent,
} from 'react'

import { useTheme } from '@/components/theme-context'
import { useFocus } from '@/components/workspace/focus/providers/focus-state'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { DEFAULT_MONO_FONT_STACK } from '@/lib/default-nerd-font'
import { connectTerminalSocket, type EdenServerSocket } from '@/lib/server-sockets'

import { sendTerminalClientMessage } from './terminal-socket'
import { readTerminalTheme } from './terminal-theme'
import { isFocusOutsideElement } from './utils/focus-target'

type TerminalDimensions = {
  cols: number
  rows: number
}

type TerminalCursorStyle = 'block' | 'underline' | 'bar' | 'outline'

type TerminalCursorOptions = {
  cursorBlink: boolean
  cursorStyle: TerminalCursorStyle
}

const FOCUSED_TERMINAL_CURSOR: TerminalCursorOptions = {
  cursorBlink: true,
  cursorStyle: 'block',
}

const UNFOCUSED_TERMINAL_CURSOR: TerminalCursorOptions = {
  cursorBlink: false,
  cursorStyle: 'outline',
}

let ghosttyInitPromise: Promise<void> | null = null

export function TerminalPanel({
  active = true,
  className,
  rootPath,
  sessionId,
  ...sectionProps
}: TerminalPanelProps) {
  const activationFrameRef = useRef<number | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const { resolvedTheme } = useTheme()
  const terminalHasFocusArea = useFocus((state) => state.activeArea === 'terminal')
  const setFocusArea = useFocus((state) => state.setFocusArea)
  const activateTerminalAfterFrame = useEffectEvent(() => {
    if (activationFrameRef.current !== null) {
      window.cancelAnimationFrame(activationFrameRef.current)
    }

    activationFrameRef.current = window.requestAnimationFrame(() => {
      activationFrameRef.current = null
      fitAddonRef.current?.fit()
      terminalRef.current?.focus()
    })
  })
  const activateTerminalIfActive = useEffectEvent(() => {
    if (active) activateTerminalAfterFrame()
  })
  const handleTerminalFocus = () => {
    setFocusArea('terminal')
    applyTerminalCursorOptions(terminalRef.current, FOCUSED_TERMINAL_CURSOR)
  }
  const handleTerminalBlur = (event: FocusEvent<HTMLElement>) => {
    if (!isFocusOutsideElement(event.currentTarget, event.relatedTarget)) return

    applyTerminalCursorOptions(terminalRef.current, UNFOCUSED_TERMINAL_CURSOR)
  }
  const handleTerminalPointerDown = () => {
    setFocusArea('terminal')
    applyTerminalCursorOptions(terminalRef.current, FOCUSED_TERMINAL_CURSOR)
  }

  // ghostty-web bakes the theme into its WASM terminal at construction and has
  // no runtime theme API, so a live theme switch is applied by rebuilding the
  // terminal: the new instance reads the active CSS palette and the server
  // replays its buffer on reconnect (same as a page refresh).
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const unmountTerminal = mountTerminal({
      host,
      rootPath,
      sessionId,
      onReady: (terminal, fitAddon) => {
        fitAddonRef.current = fitAddon
        terminalRef.current = terminal
        activateTerminalIfActive()
      },
    })

    return () => {
      if (activationFrameRef.current !== null) {
        window.cancelAnimationFrame(activationFrameRef.current)
        activationFrameRef.current = null
      }

      terminalRef.current = null
      fitAddonRef.current = null
      unmountTerminal()
    }
  }, [resolvedTheme, rootPath, sessionId])

  useEffect(() => {
    if (!active) return

    activateTerminalAfterFrame()

    return () => {
      if (activationFrameRef.current !== null) {
        window.cancelAnimationFrame(activationFrameRef.current)
        activationFrameRef.current = null
      }
    }
  }, [active])

  useEffect(() => {
    applyTerminalCursorOptions(
      terminalRef.current,
      terminalHasFocusArea ? FOCUSED_TERMINAL_CURSOR : UNFOCUSED_TERMINAL_CURSOR,
    )
  }, [terminalHasFocusArea])

  return (
    <section
      aria-label='Terminal'
      {...sectionProps}
      className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden', className)}
      style={{ background: 'var(--terminal-background)' }}
      onBlurCapture={handleTerminalBlur}
      onFocusCapture={handleTerminalFocus}
      onPointerDownCapture={handleTerminalPointerDown}
    >
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden px-3 py-2 font-mono' ref={hostRef} />
    </section>
  )
}

type TerminalPanelProps = ComponentPropsWithoutRef<'section'> & {
  active?: boolean
  rootPath: string
  sessionId: string
}

function mountTerminal({
  host,
  rootPath,
  sessionId,
  onReady,
}: {
  host: HTMLDivElement
  rootPath: string
  sessionId: string
  onReady: (terminal: Terminal, fitAddon: FitAddon) => void
}) {
  let cancelled = false
  let dataDisposable: IDisposable | null = null
  let fitAddon: FitAddon | null = null
  let resizeDisposable: IDisposable | null = null
  let socket: EdenServerSocket | null = null
  let terminal: Terminal | null = null
  let terminalDimensions: TerminalDimensions | null = null

  void initializeGhostty()
    .then(() => {
      if (cancelled) return

      terminal = createTerminal(host)
      fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(host)
      fitAddon.fit()
      terminalDimensions = currentTerminalDimensions(terminal)
      fitAddon.observeResize()
      onReady(terminal, fitAddon)
      dataDisposable = terminal.onData((data) =>
        sendTerminalClientMessage(socket, { type: 'input', data }),
      )
      resizeDisposable = terminal.onResize((dimensions) => {
        terminalDimensions = dimensions
        sendTerminalResize(socket, dimensions)
      })
      socket = openTerminalSocket({
        getTerminalDimensions: () => terminalDimensions,
        isCancelled: () => cancelled,
        rootPath,
        sessionId,
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

function openTerminalSocket({
  getTerminalDimensions,
  isCancelled,
  rootPath,
  sessionId,
  terminal,
}: {
  getTerminalDimensions: () => TerminalDimensions | null
  isCancelled: () => boolean
  rootPath: string
  sessionId: string
  terminal: Terminal
}) {
  const socket = connectTerminalSocket(rootPath, sessionId)

  socket.addEventListener('open', () => {
    if (isCancelled()) return

    sendTerminalResize(socket, getTerminalDimensions())
  })
  socket.addEventListener('message', (event) => {
    if (isCancelled()) return

    const message = parseTerminalServerMessage((event as MessageEvent).data)
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
  if (message.type === 'output') {
    terminal.write(message.data)
    return
  }
  if (message.type === 'ready') {
    return
  }
  if (message.type === 'exit') {
    terminal.writeln('')
    terminal.writeln(exitDetail(message.exitCode))
    return
  }

  terminal.writeln('')
  terminal.writeln(message.message)
}

function createTerminal(root: HTMLElement) {
  return new Terminal({
    allowTransparency: true,
    cursorBlink: UNFOCUSED_TERMINAL_CURSOR.cursorBlink,
    cursorStyle: patchedTerminalCursorStyle(UNFOCUSED_TERMINAL_CURSOR.cursorStyle),
    fontFamily: DEFAULT_MONO_FONT_STACK,
    fontSize: 12,
    scrollback: 10_000,
    smoothScrollDuration: 80,
    theme: readTerminalTheme(root),
  })
}

function applyTerminalCursorOptions(terminal: Terminal | null, options: TerminalCursorOptions) {
  if (!terminal) return

  terminal.options.cursorStyle = patchedTerminalCursorStyle(options.cursorStyle)
  terminal.options.cursorBlink = options.cursorBlink
}

function patchedTerminalCursorStyle(style: TerminalCursorStyle) {
  // ghostty-web is patched to support outline before its published types do.
  return style as Terminal['options']['cursorStyle']
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
  socket: EdenServerSocket | null,
  dimensions: TerminalDimensions | null,
) {
  if (!dimensions) return false

  return sendTerminalClientMessage(socket, {
    cols: dimensions.cols,
    rows: dimensions.rows,
    type: 'resize',
  })
}

function closeTerminalSocket(socket: EdenServerSocket | null) {
  if (!socket) return
  if (socket.readyState === 3) return
  if (socket.readyState === 2) return

  socket.close()
}

function exitDetail(exitCode: number | null) {
  if (exitCode === null) return 'Process exited'

  return `Process exited ${exitCode}`
}
