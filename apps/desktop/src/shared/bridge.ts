import type { HealthDescriptor } from '@workspace/contracts'

import type { ShellBackdrop } from './window'

export type PlatformPickOptions = {
  mode: 'folder' | 'file'
  accept?: readonly string[]
  startingPath?: string
  multiple?: boolean
}

export type PlatformBridge = {
  // What is behind this window, so the web layer knows whether to draw a
  // wallpaper and a floor of its own. The shell reports what it actually
  // created, never what the setting currently says.
  backdrop: ShellBackdrop
  pickEntry(options: PlatformPickOptions): Promise<string[]>
  connectMachine(name: string): Promise<PlatformMachineState>
  disconnectMachine(name: string): Promise<void>
  onMachineState(listener: (state: PlatformMachineState) => void): () => void
}

export type PlatformMachineState =
  | { name: string; phase: 'idle' | 'launching' | 'connecting' }
  | {
      name: string
      phase: 'live'
      origin: string
      localPort: number
      descriptor: HealthDescriptor
    }
  | {
      name: string
      phase: 'offline' | 'blocked' | 'identity-drift'
      lastError: string
      lastErrorAt: number
    }
