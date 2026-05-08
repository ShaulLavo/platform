import { homedir } from 'node:os'
import path from 'node:path'
import { createApp } from './app'

const port = Number(Bun.env.PORT ?? 3001)
const homeDirectory = homedir()
const workspaceRoot = Bun.env.FS_WORKSPACE_ROOT ?? path.parse(homeDirectory).root
const watch = Bun.env.FS_WATCH === 'true'

export const app = createApp({ homeDirectory, watch, workspaceRoot }).listen(port, server => {
	console.log(`FS RPC server listening at http://${server.hostname}:${server.port}`)
	console.log(`Workspace root: ${workspaceRoot}`)
})

export type App = typeof app
