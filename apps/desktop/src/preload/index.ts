import { createDesktopError } from './structured-errors'

import { Electroview } from 'electrobun/view'
import type { DesktopRPC } from '../shared/rpc'
import type { PlatformBridge, PlatformMachineState } from '../shared/bridge'
import { readShellHandoff } from '../shared/window'

const machineListeners = new Set<(state: PlatformMachineState) => void>()
const machineStates = new Map<string, PlatformMachineState>()

function machineState(state: PlatformMachineState) {
  machineStates.set(state.name, state)
  for (const listener of machineListeners) listener(state)
}

const rpc = Electroview.defineRPC<DesktopRPC>({
  maxRequestTime: Infinity,
  handlers: {
    requests: {},
    messages: { machineState },
  },
})

// Installed before the Electroview below, and reading nothing but the handoff
// the bun process wrote above this script: the web layer decides its floor and
// its wallpaper from `backdrop` before it paints a single frame, so that answer
// must not wait on — or be lost to — the RPC transport coming up.
window.platformBridge = {
  backdrop: readShellHandoff().backdrop,
  pickEntry: async (options) => {
    const client = electroview.rpc
    if (!client) throw createDesktopError('Electrobun RPC is unavailable')

    const result = await client.request.pickEntry(options)
    return result.paths
  },
  connectMachine: async (name) => {
    const client = electroview.rpc
    if (!client) throw createDesktopError('Electrobun RPC is unavailable')
    return client.request.connectMachine({ name })
  },
  disconnectMachine: async (name) => {
    const client = electroview.rpc
    if (!client) throw createDesktopError('Electrobun RPC is unavailable')
    await client.request.disconnectMachine({ name })
  },
  onMachineState: (listener) => {
    machineListeners.add(listener)
    for (const state of machineStates.values()) listener(state)
    return () => {
      machineListeners.delete(listener)
    }
  },
} satisfies PlatformBridge

const electroview = new Electroview({ rpc })

declare global {
  interface Window {
    platformBridge?: PlatformBridge
  }
}
