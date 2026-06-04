import { parseTerminalServerMessage, type TerminalServerMessage } from '@workspace/contracts'
import { cn } from '@workspace/ui/lib/utils'
import { TerminalWindowIcon, XIcon } from '@phosphor-icons/react'
import { FitAddon, init, Terminal, type IDisposable } from 'ghostty-web'
import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react'

import { useWorkspaceTerminalToggle } from '@/components/workspace/use-workspace-terminal-toggle'
import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import { reportError, toClientError } from '@/lib/client-error-taxonomy'
import { DEFAULT_MONO_FONT_STACK } from '@/lib/default-nerd-font'
import { connectTerminalSocket, type EdenServerSocket } from '@/lib/server-sockets'

import { sendTerminalClientMessage } from './terminal-socket'
import { readTerminalTheme } from './terminal-theme'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'

type TerminalDimensions = {
  cols: number
  rows: number
}

let ghosttyInitPromise: Promise<void> | null = null

export function TerminalPanel({ className, rootPath, ...sectionProps }: TerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const toggleTerminal = useWorkspaceTerminalToggle()
  const { colorMode } = useEditorColorTheme()

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    return mountTerminal({
      host,
      rootPath,
      onReady: (terminal) => {
        terminalRef.current = terminal
      },
    })
  }, [rootPath])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    terminal.options.theme = readTerminalTheme()
  }, [colorMode])

  return (
    <section
      aria-label='Terminal'
      {...sectionProps}
      className={cn(
        'border-border flex h-full min-h-0 min-w-0 flex-col overflow-hidden border',
        className,
      )}
      style={{ background: 'var(--terminal-background)' }}
      onFocusCapture={() => setFocusArea('terminal')}
      onPointerDownCapture={() => setFocusArea('terminal')}
    >
      <header className='text-muted-foreground border-border/60 flex h-8 shrink-0 items-center justify-between gap-2 border-b px-3'>
        <span className='flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase'>
          <TerminalWindowIcon className='size-3.5' weight='bold' />
          Terminal
        </span>
        <button
          aria-label='Close terminal'
          className='hover:text-foreground hover:bg-muted/60 -mr-1 flex size-5 items-center justify-center rounded-md transition-colors'
          onClick={toggleTerminal}
          title='Close terminal'
          type='button'
        >
          <XIcon className='size-3.5' />
        </button>
      </header>
      <div className='min-h-0 min-w-0 flex-1 overflow-hidden px-3 py-2 font-mono' ref={hostRef} />
    </section>
  )
}

type TerminalPanelProps = ComponentPropsWithoutRef<'section'> & {
  rootPath: string
}

function mountTerminal({
  host,
  rootPath,
  onReady,
}: {
  host: HTMLDivElement
  rootPath: string
  onReady: (terminal: Terminal) => void
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

      terminal = createTerminal()
      fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(host)
      fitAddon.fit()
      terminalDimensions = currentTerminalDimensions(terminal)
      fitAddon.observeResize()
      terminal.focus()
      onReady(terminal)
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
  terminal,
}: {
  getTerminalDimensions: () => TerminalDimensions | null
  isCancelled: () => boolean
  rootPath: string
  terminal: Terminal
}) {
  const socket = connectTerminalSocket(rootPath)

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

function createTerminal() {
  return new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: DEFAULT_MONO_FONT_STACK,
    fontSize: 12,
    scrollback: 10_000,
    smoothScrollDuration: 80,
    theme: readTerminalTheme(),
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
