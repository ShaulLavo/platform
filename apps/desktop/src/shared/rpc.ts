import type { RPCSchema } from 'electrobun'
import type { PlatformMachineState, PlatformPickOptions } from './bridge'

type PlatformPickResult = {
  paths: string[]
}

export type DesktopRPC = {
  bun: RPCSchema<{
    requests: {
      pickEntry: {
        params: PlatformPickOptions
        response: PlatformPickResult
      }
      connectMachine: { params: { name: string }; response: PlatformMachineState }
      disconnectMachine: { params: { name: string }; response: void }
    }
    messages: Record<string, never>
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: { machineState: PlatformMachineState }
  }>
}
