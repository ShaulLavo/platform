import { treaty } from "@elysia/eden"

import type { App } from "server"

const defaultFsServerUrl = "http://localhost:3001"

export const fsServerUrl =
  import.meta.env.VITE_FS_SERVER_URL ?? defaultFsServerUrl

export const fsClient = treaty<App>(fsServerUrl)

export type FsClient = typeof fsClient
