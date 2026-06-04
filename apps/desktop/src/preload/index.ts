import { Electroview } from 'electrobun/view'
import type { DesktopRPC, PlatformBridge } from '../shared/rpc'

const rpc = Electroview.defineRPC<DesktopRPC>({
  handlers: {
    requests: {},
    messages: {},
  },
})
const electroview = new Electroview({ rpc })
const rpcClient = electroview.rpc
if (!rpcClient) throw new Error('Electrobun RPC is unavailable')

window.platformBridge = {
  pickEntry: (options) => rpcClient.request.pickEntry(options),
} satisfies PlatformBridge

declare global {
  interface Window {
    platformBridge?: PlatformBridge
  }
}
