import { treaty } from '@elysia/eden'
import type { App } from './app'

export const createFsClient = (url: string) => treaty<App>(url)
export type FsClient = ReturnType<typeof createFsClient>
