import type { RPCSchema } from 'electrobun'

export type PlatformPickOptions = {
  mode: 'folder' | 'file'
  accept?: readonly string[]
  startingPath?: string
  multiple?: boolean
}

export type PlatformBridge = {
  pickEntry(options: PlatformPickOptions): Promise<string[]>
}

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
    }
    messages: Record<string, never>
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: Record<string, never>
  }>
}
