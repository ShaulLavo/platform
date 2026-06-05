import type { PlatformBridge } from './bridge'

declare global {
  interface Window {
    platformBridge?: PlatformBridge
  }
}

export {}
