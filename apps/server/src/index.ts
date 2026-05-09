import { homedir } from 'node:os'
import path from 'node:path'
import { createApp } from './app'

const port = Number(Bun.env.PORT ?? 3001)
const hostname = Bun.env.FS_HOST ?? Bun.env.HOST ?? '127.0.0.1'
const homeDirectory = homedir()
const workspaceRoot = Bun.env.FS_WORKSPACE_ROOT ?? path.parse(homeDirectory).root
const watch = Bun.env.FS_WATCH === 'true'
const allowedOrigins = allowedOriginsFromEnv(Bun.env.FS_ALLOWED_ORIGINS)

assertLoopbackHost(hostname)

export const app = createApp({
	auth: { allowedOrigins },
	homeDirectory,
	watch,
	workspaceRoot
}).listen({ hostname, port }, server => {
	console.log(`FS RPC server listening at http://${server.hostname}:${server.port}`)
	console.log(`Workspace root: ${workspaceRoot}`)
})

export type App = typeof app

function allowedOriginsFromEnv(value: string | undefined) {
	if (!value) return undefined

	const origins = value.split(',').map(origin => origin.trim()).filter(Boolean)
	return origins.length > 0 ? origins : undefined
}

function assertLoopbackHost(host: string) {
	if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return

	throw new Error('FS RPC server must bind to a loopback host')
}
