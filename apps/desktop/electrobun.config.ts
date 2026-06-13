import type { ElectrobunConfig } from 'electrobun'

export default {
  app: {
    name: 'Platform',
    identifier: 'dev.platform.desktop',
    version: '0.0.1',
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    copy: {
      // Native macOS vibrancy bridge, loaded by src/bun/index.ts over FFI.
      'src/bun/libMacWindowEffects.dylib': 'bun/libMacWindowEffects.dylib',
    },
    bun: {
      entrypoint: 'src/bun/index.ts',
    },
    mac: {
      bundleCEF: true,
      defaultRenderer: 'cef',
    },
    win: {
      bundleCEF: true,
      defaultRenderer: 'cef',
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: 'cef',
    },
    views: {
      preload: {
        entrypoint: 'src/preload/index.ts',
      },
    },
  },
} satisfies ElectrobunConfig
