import { treaty } from '@elysia/eden'

import type { App } from 'server'

const defaultServerUrl = 'http://localhost:3001'

export const serverUrl = import.meta.env.VITE_FS_SERVER_URL ?? defaultServerUrl

export const client = treaty<App>(serverUrl)

export type Client = typeof client
