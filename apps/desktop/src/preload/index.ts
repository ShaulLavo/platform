import { createDesktopError } from './structured-errors'

import { Electroview } from 'electrobun/view'
import type { DesktopRPC, PlatformBridge } from '../shared/rpc'
import { WINDOW_TRANSPARENT } from '../shared/window'

const rpc = Electroview.defineRPC<DesktopRPC>({
  maxRequestTime: Infinity,
  handlers: {
    requests: {},
    messages: {},
  },
})
const electroview = new Electroview({ rpc })
const rpcClient = electroview.rpc
if (!rpcClient) throw createDesktopError('Electrobun RPC is unavailable')

window.platformBridge = {
  hasNativeVibrancy: WINDOW_TRANSPARENT,
  pickEntry: async (options) => {
    const result = await rpcClient.request.pickEntry(options)
    return result.paths
  },
} satisfies PlatformBridge

declare global {
  interface Window {
    platformBridge?: PlatformBridge
  }
}
