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

export type DesktopRPC = {
  bun: RPCSchema<{
    requests: {
      pickEntry: {
        params: PlatformPickOptions
        response: string[]
      }
    }
    messages: Record<string, never>
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: Record<string, never>
  }>
}
