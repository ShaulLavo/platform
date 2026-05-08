import { watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { FsError } from './errors'
import { isIgnoredPath, toPosix, type WorkspacePaths } from './path'
import type { WatchServerMessage } from './contracts'

type Listener = (event: WatchServerMessage) => void

export type WatchOptions = {
	enabled: boolean
}

export class FileChangeHub {
	private readonly listeners = new Set<Listener>()
	private readonly paths: WorkspacePaths
	private watcher: FSWatcher | null = null

	constructor(paths: WorkspacePaths, options: WatchOptions) {
		this.paths = paths
		if (!options.enabled) return
		this.start()
	}

	emit(event: WatchServerMessage) {
		if (!isFilesystemEvent(event)) return this.broadcast(event)
		if (isIgnoredPath(event.path)) return

		this.broadcast(event)
	}

	stream(inputs: string[], signal?: AbortSignal) {
		const subscribed = new Set(inputs.map(input => this.paths.resolve(input).relativePath))
		return this.createStream(subscribed, signal)
	}

	close() {
		this.watcher?.close()
		this.watcher = null
		this.listeners.clear()
	}

	private start() {
		try {
			this.watcher = watch(this.paths.workspaceRoot, { recursive: true }, (event, filename) => {
				void this.handleNativeEvent(event, filename?.toString() ?? '')
			})
		} catch {
			this.watcher = null
		}
	}

	private async handleNativeEvent(nativeEvent: string, filename: string) {
		const relativePath = normalizeWatchFilename(filename)
		if (!relativePath) return
		if (isIgnoredPath(relativePath)) return

		this.broadcast({
			type: await nativeEventType(this.paths, relativePath, nativeEvent),
			path: relativePath
		})
	}

	private async *createStream(subscribed: Set<string>, signal?: AbortSignal) {
		const queue: WatchServerMessage[] = [{ type: 'ready', root: '' }]
		let wake: (() => void) | null = null

		const listener = (event: WatchServerMessage) => {
			if (!shouldDeliver(event, subscribed)) return
			queue.push(event)
			wake?.()
		}

		const abort = () => wake?.()
		this.listeners.add(listener)
		signal?.addEventListener('abort', abort)

		try {
			while (!signal?.aborted) {
				if (queue.length) {
					yield queue.shift()!
					continue
				}

				await new Promise<void>(resolve => {
					wake = resolve
				})
				wake = null
			}
		} finally {
			this.listeners.delete(listener)
			signal?.removeEventListener('abort', abort)
		}
	}

	private broadcast(event: WatchServerMessage) {
		for (const listener of this.listeners) listener(event)
	}
}

function normalizeWatchFilename(filename: string) {
	if (!filename) return ''

	return toPosix(filename)
}

function isFilesystemEvent(event: WatchServerMessage) {
	return event.type === 'created' || event.type === 'changed' || event.type === 'deleted' || event.type === 'renamed'
}

function shouldDeliver(event: WatchServerMessage, subscribed: Set<string>) {
	if (!isFilesystemEvent(event)) return true
	if (!subscribed.size) return true
	if (subscribed.has(event.path)) return true
	if (event.type !== 'renamed') return false

	return subscribed.has(event.oldPath)
}

async function nativeEventType(
	paths: WorkspacePaths,
	relativePath: string,
	nativeEvent: string
): Promise<'created' | 'changed' | 'deleted'> {
	if (nativeEvent === 'change') return 'changed'

	const exists = await pathExists(paths, relativePath)
	return exists ? 'created' : 'deleted'
}

async function pathExists(paths: WorkspacePaths, relativePath: string) {
	try {
		const target = paths.resolve(relativePath)
		await stat(target.absolutePath)
		return true
	} catch {
		return false
	}
}

export function parseWatchInputs(pathInput?: string, pathsInput?: string | string[]) {
	const inputs = [pathInput, ...pathInputs(pathsInput)]
	const trimmed = inputs.map(input => input?.trim() ?? '').filter(Boolean)

	if (!trimmed.length) return []
	if (trimmed.some(input => input.includes(path.delimiter))) throw new FsError('INVALID_PATH')

	return trimmed
}

function pathInputs(input?: string | string[]) {
	if (!input) return []
	if (Array.isArray(input)) return input

	return input.split(',')
}
