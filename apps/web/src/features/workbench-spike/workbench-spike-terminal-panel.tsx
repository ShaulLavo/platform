import { FitAddon, init, Terminal } from 'ghostty-web'
import { useContext, useEffect, useEffectEvent, useRef } from 'react'

import { WorkbenchSpikeMetricsContext } from '@/features/workbench-spike/workbench-spike-metrics-context'
import type { WorkbenchSpikePanel } from '@/features/workbench-spike/workbench-spike-types'
import { DEFAULT_MONO_FONT_STACK } from '@/lib/default-nerd-font'
import { readTerminalTheme } from '@/features/terminal/terminal-theme'

let ghosttyInitPromise: Promise<void> | null = null

export function WorkbenchSpikeTerminalPanel({ panel }: { panel: WorkbenchSpikePanel }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const { onTerminalPanelMounted, onTerminalPanelResized } = useContext(
    WorkbenchSpikeMetricsContext,
  )
  const notifyTerminalPanelMounted = useEffectEvent(onTerminalPanelMounted)
  const notifyTerminalPanelResized = useEffectEvent(onTerminalPanelResized)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    notifyTerminalPanelMounted(panel.id)
    return mountTerminalProbe(host, panel.id, notifyTerminalPanelResized)
  }, [panel.id])

  return (
    <section className='workbench-spike-panel workbench-spike-terminal-panel'>
      <div className='workbench-spike-terminal-host' ref={hostRef} />
    </section>
  )
}

function mountTerminalProbe(
  host: HTMLDivElement,
  panelId: string,
  onResize: Parameters<
    typeof WorkbenchSpikeMetricsContext.Provider
  >[0]['value']['onTerminalPanelResized'],
) {
  let cancelled = false
  let fitAddon: FitAddon | null = null
  let terminal: Terminal | null = null

  void initializeGhostty()
    .then(() => {
      if (cancelled) return

      terminal = createTerminalProbe(host)
      fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(host)
      terminal.write(`$ platform workbench-spike --panel ${panelId}\r\n`)
      terminal.write('Dockview resize probe ready. Drag a sash to update terminal cells.\r\n')
      fitAddon.fit()
      fitAddon.observeResize()
      onResize(panelId, terminalSize(terminal))
      terminal.onResize(() => {
        if (!terminal) return

        onResize(panelId, terminalSize(terminal))
      })
    })
    .catch(() => {
      host.textContent = 'Terminal probe failed to initialize.'
    })

  return () => {
    cancelled = true
    fitAddon?.dispose()
    terminal?.dispose()
    host.replaceChildren()
  }
}

function createTerminalProbe(host: HTMLElement) {
  return new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: DEFAULT_MONO_FONT_STACK,
    fontSize: 12,
    scrollback: 2000,
    smoothScrollDuration: 80,
    theme: readTerminalTheme(host),
  })
}

function terminalSize(terminal: Terminal) {
  return {
    cols: terminal.cols,
    height: terminal.element?.clientHeight ?? 0,
    rows: terminal.rows,
    width: terminal.element?.clientWidth ?? 0,
  }
}

function initializeGhostty() {
  ghosttyInitPromise ??= init()
  return ghosttyInitPromise
}
