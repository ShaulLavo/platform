import type { RPCSchema } from 'electrobun'

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
