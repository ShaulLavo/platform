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
    bun: {
      entrypoint: 'src/bun/index.ts',
    },
    mac: {
      defaultRenderer: 'native',
    },
    views: {
      preload: {
        entrypoint: 'src/preload/index.ts',
      },
    },
  },
} satisfies ElectrobunConfig
