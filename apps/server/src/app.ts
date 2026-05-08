import { cors } from '@elysiajs/cors'
import { Elysia, sse } from 'elysia'
import {
	copyBodySchema,
	createFileBodySchema,
	createFolderBodySchema,
	deleteBodySchema,
	eventsQuerySchema,
	findQuerySchema,
	pathQuerySchema,
	recordRecentBodySchema,
	recentsQuerySchema,
	renameBodySchema,
	treeQuerySchema,
	writeBodySchema,
	type WatchServerMessage
} from './fs/contracts'
import { errorPayload, FsError, isFsError } from './fs/errors'
import { FileSystemService, type FileSystemServiceOptions } from './fs/service'
import type { FindStreamEvent } from './fs/search'
import { parseWatchInputs } from './fs/watch'
import { typeScriptLspRoutes } from './lsp/typescript/routes'

export function createApp(options: FileSystemServiceOptions = {}) {
	const fs = new FileSystemService(options)

	return new Elysia({ name: 'fs-rpc' })
		.use(cors())
		.onError(({ code, error, set }) => {
			if (isFsError(error)) {
				set.status = error.statusCode
				return errorPayload(error)
			}

			if (code === 'VALIDATION') {
				set.status = 400
				return errorPayload(new FsError('INVALID_PATH', error.message))
			}

			set.status = 500
			return errorPayload(new FsError('OPERATION_FAILED'))
		})
		.get('/health', () => ({
			ok: true,
			...fs.info()
		}))
		.ws('/lsp/typescript', typeScriptLspRoutes(fs))
		.group('/fs', app =>
			app
				.get('/stat', ({ query }) => fs.stat(query.path), {
					query: pathQuerySchema
				})
				.get('/tree', ({ query }) => fs.tree(query.path, query.depth, query.entryType), {
					query: treeQuerySchema
				})
				.get('/read', ({ query }) => fs.read(query.path), {
					query: pathQuerySchema
				})
				.get('/blob', async ({ query }) => fileResponse(await fs.blob(query.path)), {
					query: pathQuerySchema
				})
				.get('/find/events', ({ query, request }) => toFindSse(fs.findEvents(
					query.path,
					query.query,
					query.limit,
					query.includeContent,
					query.entryType,
					query.maxDepth,
					request.signal
				)), {
					query: findQuerySchema
				})
				.get('/find', ({ query }) => fs.find(
					query.path,
					query.query,
					query.limit,
					query.includeContent,
					query.entryType,
					query.maxDepth
				), {
					query: findQuerySchema
				})
				.get('/search', ({ query }) => fs.find(
					query.path,
					query.query,
					query.limit,
					query.includeContent,
					query.entryType,
					query.maxDepth
				), {
					query: findQuerySchema
				})
				.get('/events', ({ query, request }) => toSse(fs.events(
					parseWatchInputs(query.path, query.paths),
					request.signal
				)), {
					query: eventsQuerySchema
				})
				.get('/recents', ({ query }) => fs.recents(query.limit), {
					query: recentsQuerySchema
				})
				.post('/recents', ({ body }) => fs.recordRecent(body.path), {
					body: recordRecentBodySchema
				})
				.post('/write', ({ body }) => fs.write(body), {
					body: writeBodySchema
				})
				.post('/create-file', ({ body }) => fs.createFile(body), {
					body: createFileBodySchema
				})
				.post('/create-folder', ({ body }) => fs.createFolder(body), {
					body: createFolderBodySchema
				})
				.post('/rename', ({ body }) => fs.rename(body), {
					body: renameBodySchema
				})
				.post('/move', ({ body }) => fs.rename(body), {
					body: renameBodySchema
				})
				.post('/copy', ({ body }) => fs.copy(body), {
					body: copyBodySchema
				})
				.post('/delete', ({ body }) => fs.delete(body), {
					body: deleteBodySchema
				})
		)
		.onStop(() => {
			fs.close()
		})
}

export type App = ReturnType<typeof createApp>

type BlobFile = Awaited<ReturnType<FileSystemService['blob']>>

async function fileResponse(result: BlobFile) {
	const file = Bun.file(result.absolutePath)
	const headers = new Headers({
		'content-length': String(result.size),
		'x-fs-path': result.path,
		'x-fs-mtime-ms': String(result.mtimeMs)
	})

	headers.set('content-type', file.type || 'application/octet-stream')
	return new Response(file, { headers })
}

async function* toSse(events: AsyncGenerator<WatchServerMessage>) {
	for await (const event of events) {
		yield sse({
			event: event.type,
			data: event
		})
	}
}

async function* toFindSse(events: AsyncGenerator<FindStreamEvent>) {
	try {
		for await (const event of events) {
			yield sse({
				event: event.type,
				data: findEventData(event)
			})
		}
	} catch (error) {
		const fsError = isFsError(error) ? error : new FsError('OPERATION_FAILED')
		yield sse({
			event: 'error',
			data: errorPayload(fsError)
		})
	}
}

function findEventData(event: FindStreamEvent) {
	if (event.type === 'match') return { match: event.match }

	return {
		query: event.query,
		path: event.path,
		count: event.count,
		truncated: event.truncated
	}
}
