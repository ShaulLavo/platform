import type { RPCSchema } from 'electrobun'

export type PlatformPickOptions = {
  mode: 'folder' | 'file'
  accept?: readonly string[]
  startingPath?: string
  multiple?: boolean
}

export type PlatformBridge = {
  // Whether macOS composites the desktop behind the window, so the web layer
  // knows to skip drawing a wallpaper of its own.
  hasNativeVibrancy: boolean
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
