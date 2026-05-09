import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { lstat, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'
import { FsError, mapNodeError } from './errors'
import {
	assertExistingRealPathInside,
	defaultIgnoredNames,
	isIgnoredPath,
	toPosix,
	type WorkspacePaths
} from './path'
import { assertDirectory, type FsEntryType, typeFromStats } from './stat'
import type { EntryTypeFilter } from './contracts'

/**
 * Maximum size, in bytes, of the bounded line/chunk buffer used by the
 * streaming fallback content matcher in `addContentMatch`.
 *
 * Unit: bytes (64 KiB = 65_536).
 *
 * Purpose: caps memory held by the streaming UTF-8 line reader to a single
 * fixed-size buffer per concurrent file scan, so matching a file at the
 * per-file size limit never forces the full file into memory.
 *
 * Rationale: 64 KiB comfortably fits typical source-file lines (which are
 * usually well under 1 KiB and almost always under 16 KiB even for minified
 * or generated output), while keeping the worst-case resident memory of a
 * concurrent search low. Lines longer than the buffer are split at the
 * buffer boundary by the reader; they continue to participate in matching
 * at byte-level positions but do not grow the buffer.
 */
export const SEARCH_LINE_BUFFER_BYTES = 65_536

export type FindOptions = {
	query: string
	path: string
	limit: number
	includeContent: boolean
	entryType?: EntryTypeFilter
	maxDepth?: number
	maxContentBytes: number
}

export type FindMatch = {
	kind: 'name' | 'content'
	path: string
	type: FsEntryType
	line?: number
	column?: number
	preview?: string
}

export type FindResult = {
	query: string
	path: string
	matches: FindMatch[]
}

export type FindStreamEvent =
	| {
		type: 'match'
		match: FindMatch
	}
	| {
		type: 'done'
		query: string
		path: string
		count: number
		truncated: boolean
	}

type FindContext = {
	root: {
		absolutePath: string
		relativePath: string
	}
	query: string
	normalizedQuery: string
	options: FindOptions
}

type SearchState = {
	count: number
	truncated: boolean
}

const commandAvailability = new Map<string, Promise<boolean>>()

export async function findInWorkspace(
	paths: WorkspacePaths,
	options: FindOptions
): Promise<FindResult> {
	const matches: FindMatch[] = []
	let resultPath = options.path

	for await (const event of findInWorkspaceStream(paths, options)) {
		if (event.type === 'done') {
			resultPath = event.path
			continue
		}

		if (event.type === 'match') matches.push(event.match)
	}

	return {
		query: options.query,
		path: resultPath,
		matches
	}
}

export async function* findInWorkspaceStream(
	paths: WorkspacePaths,
	options: FindOptions,
	signal?: AbortSignal
): AsyncGenerator<FindStreamEvent> {
	const context = await createFindContext(paths, options)
	const matches = searchWithTools(paths, context, signal)
	const state: SearchState = { count: 0, truncated: false }

	for await (const match of matches) {
		if (state.count >= options.limit) {
			state.truncated = true
			break
		}

		state.count += 1
		yield { type: 'match', match }
	}

	yield {
		type: 'done',
		query: context.query,
		path: context.root.relativePath,
		count: state.count,
		truncated: state.truncated
	}
}

async function createFindContext(
	paths: WorkspacePaths,
	options: FindOptions
): Promise<FindContext> {
	const root = paths.resolve(options.path)
	const normalizedQuery = options.query.toLocaleLowerCase()

	if (!normalizedQuery) throw new FsError('INVALID_PATH', 'query is required')

	try {
		await assertExistingRealPathInside(paths, root.absolutePath)
		const stats = await stat(root.absolutePath)
		assertDirectory(stats)

		return {
			query: options.query,
			normalizedQuery,
			options,
			root
		}
	} catch (error) {
		if (error instanceof FsError) throw error
		throw mapNodeError(error)
	}
}

async function* searchWithTools(
	paths: WorkspacePaths,
	context: FindContext,
	signal?: AbortSignal
): AsyncGenerator<FindMatch> {
	if (!(await canUseTools(context.options))) {
		// TODO: remove this fallback after fd/rg installation or tool discovery is guaranteed.
		yield* searchWithFallback(paths, context)
		return
	}

	yield* searchNamesWithFd(paths, context, signal)
	if (!shouldSearchContent(context.options)) return

	yield* searchContentWithRg(paths, context, signal)
}

async function canUseTools(options: FindOptions) {
	if (!(await commandExists('fd'))) return false
	if (!shouldSearchContent(options)) return true

	return commandExists('rg')
}

function commandExists(command: string) {
	const existing = commandAvailability.get(command)
	if (existing) return existing

	const availability = checkCommand(command)
	commandAvailability.set(command, availability)
	return availability
}

function checkCommand(command: string) {
	return new Promise<boolean>(resolve => {
		const child = spawn(command, ['--version'], { stdio: 'ignore' })
		child.once('error', () => resolve(false))
		child.once('close', code => resolve(code === 0))
	})
}

async function* searchNamesWithFd(
	paths: WorkspacePaths,
	context: FindContext,
	signal?: AbortSignal
): AsyncGenerator<FindMatch> {
	const args = fdArgs(context)

	for await (const line of runToolLines('fd', args, signal, [0])) {
		const relativePath = resultPath(context.root.relativePath, line)
		const match = await nameMatchFromPath(paths, relativePath, context.options.entryType)
		if (!match) continue
		yield match
	}
}

async function* searchContentWithRg(
	paths: WorkspacePaths,
	context: FindContext,
	signal?: AbortSignal
): AsyncGenerator<FindMatch> {
	const args = rgArgs(context)

	for await (const line of runToolLines('rg', args, signal, [0, 1])) {
		const match = await contentMatchFromJson(paths, context, line)
		if (!match) continue
		yield match
	}
}

function fdArgs(context: FindContext) {
	const args = [
		'--base-directory',
		context.root.absolutePath,
		'--fixed-strings',
		'--ignore-case',
		'--hidden',
		'--no-ignore',
		'--path-separator',
		'/'
	]

	const type = fdType(context.options.entryType)
	if (type) args.push('--type', type)
	if (context.options.maxDepth !== undefined) args.push('--max-depth', String(context.options.maxDepth))

	for (const ignored of defaultIgnoredNames) args.push('--exclude', ignored)

	args.push(context.query)
	return args
}

function rgArgs(context: FindContext) {
	const args = [
		'--json',
		'--fixed-strings',
		'--ignore-case',
		'--hidden',
		'--no-ignore',
		'--max-filesize',
		String(context.options.maxContentBytes)
	]

	if (context.options.maxDepth !== undefined) args.push('--max-depth', String(context.options.maxDepth))
	for (const ignored of defaultIgnoredNames) args.push('--glob', `!${ignored}/**`)

	args.push('--regexp', context.query, context.root.absolutePath)
	return args
}

function fdType(entryType?: EntryTypeFilter) {
	if (entryType === 'file') return 'file'
	if (entryType === 'directory') return 'directory'
	if (entryType === 'symlink') return 'symlink'

	return null
}

function shouldSearchContent(options: FindOptions) {
	if (!options.includeContent) return false
	if (options.entryType && options.entryType !== 'file') return false

	return true
}

async function nameMatchFromPath(
	paths: WorkspacePaths,
	relativePath: string,
	entryType?: EntryTypeFilter
): Promise<FindMatch | null> {
	const absolutePath = paths.resolve(relativePath).absolutePath
	const stats = await safeLstatInside(paths, absolutePath)
	if (!stats) return null

	const type = typeFromStats(stats)
	if (entryType && type !== entryType) return null

	return {
		kind: 'name',
		path: relativePath,
		type
	}
}

async function contentMatchFromJson(
	paths: WorkspacePaths,
	context: FindContext,
	line: string
): Promise<FindMatch | null> {
	const event = parseRgLine(line)
	if (!event) return null
	if (!isRgMatchEvent(event)) return null

	return contentMatchFromRgEvent(paths, context, event)
}

async function contentMatchFromRgEvent(
	paths: WorkspacePaths,
	context: FindContext,
	event: RgMatchEvent
): Promise<FindMatch | null> {
	const relativePath = rgRelativePath(paths, context, event.data.path.text)
	const absolutePath = paths.resolve(relativePath).absolutePath
	const stats = await safeContentStatInside(paths, absolutePath)
	if (!stats) return null
	if (!stats.isFile()) return null

	const line = event.data.lines.text
	const match = event.data.submatches[0]
	if (!match) return null

	return {
		kind: 'content',
		path: relativePath,
		type: 'file',
		line: event.data.line_number,
		column: match.start + 1,
		preview: line.trim().slice(0, 240)
	}
}

function rgRelativePath(paths: WorkspacePaths, context: FindContext, input: string) {
	const absolutePath = path.isAbsolute(input)
		? input
		: path.join(context.root.absolutePath, input)

	return paths.toRelative(path.resolve(absolutePath))
}

function parseRgLine(line: string): RgEvent | null {
	try {
		return JSON.parse(line) as RgEvent
	} catch {
		return null
	}
}

function isRgMatchEvent(event: RgEvent): event is RgMatchEvent {
	if (event.type !== 'match') return false
	if (!event.data || typeof event.data !== 'object') return false

	return 'path' in event.data && 'lines' in event.data
}

async function* runToolLines(
	command: string,
	args: string[],
	signal: AbortSignal | undefined,
	successCodes: number[]
): AsyncGenerator<string> {
	const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
	const exit = waitForExit(child)
	const cleanup = attachAbort(signal, child)
	let completed = false

	child.stderr?.resume()

	try {
		for await (const line of readLines(child.stdout)) yield line
		completed = true
	} finally {
		cleanup()
		if (!completed) child.kill()
	}

	const code = await exit
	if (successCodes.includes(code)) return

	throw new FsError('OPERATION_FAILED', `${command} exited with code ${code}`)
}

function attachAbort(signal: AbortSignal | undefined, child: ReturnType<typeof spawn>) {
	if (!signal) return () => {}

	const abort = () => child.kill()
	signal.addEventListener('abort', abort, { once: true })
	return () => signal.removeEventListener('abort', abort)
}

function waitForExit(child: ReturnType<typeof spawn>) {
	return new Promise<number>((resolve, reject) => {
		child.once('error', reject)
		child.once('close', code => resolve(code ?? 0))
	})
}

async function* readLines(stream: NodeJS.ReadableStream | null): AsyncGenerator<string> {
	if (!stream) return

	let buffered = ''
	for await (const chunk of stream) {
		const lines = (buffered + String(chunk)).split(/\r?\n/)
		buffered = lines.pop() ?? ''
		for (const line of lines) yield line
	}

	if (buffered) yield buffered
}

async function* searchWithFallback(
	paths: WorkspacePaths,
	context: FindContext
): AsyncGenerator<FindMatch> {
	const matches: FindMatch[] = []
	await searchDirectory(
		paths,
		context.root.absolutePath,
		context.root.relativePath,
		context.normalizedQuery,
		context.options,
		matches,
		1
	)

	for (const match of matches) yield match
}

async function searchDirectory(
	paths: WorkspacePaths,
	absoluteDirectory: string,
	relativeDirectory: string,
	query: string,
	options: FindOptions,
	matches: FindMatch[],
	depth: number
) {
	if (matches.length >= options.limit) return

	const dirents = await readdir(absoluteDirectory, { withFileTypes: true })
	for (const dirent of dirents) {
		if (matches.length >= options.limit) return
		await searchEntry(paths, absoluteDirectory, relativeDirectory, dirent.name, query, options, matches, depth)
	}
}

async function searchEntry(
	paths: WorkspacePaths,
	absoluteDirectory: string,
	relativeDirectory: string,
	name: string,
	query: string,
	options: FindOptions,
	matches: FindMatch[],
	depth: number
) {
	const relativePath = joinRelative(relativeDirectory, name)
	if (isIgnoredPath(relativePath)) return

	const absolutePath = path.join(absoluteDirectory, name)
	const stats = await safeLstatInside(paths, absolutePath)
	if (!stats) return

	const type = typeFromStats(stats)
	addNameMatch(relativePath, name, type, query, matches, options.entryType)
	if (stats.isDirectory()) {
		if (!canSearchChildren(depth, options.maxDepth)) return
		await searchDirectory(paths, absolutePath, relativePath, query, options, matches, depth + 1)
		return
	}

	if (options.entryType && type !== options.entryType) return
	if (!options.includeContent) return
	if (!stats.isFile()) return
	if (stats.size > options.maxContentBytes) return

	await addContentMatch(absolutePath, relativePath, query, matches, options.limit, options.maxContentBytes)
}

function canSearchChildren(depth: number, maxDepth?: number) {
	if (maxDepth === undefined) return true

	return depth < maxDepth
}

function addNameMatch(
	relativePath: string,
	name: string,
	type: FsEntryType,
	query: string,
	matches: FindMatch[],
	entryType?: EntryTypeFilter
) {
	if (entryType && type !== entryType) return
	if (!name.toLocaleLowerCase().includes(query)) return

	matches.push({
		kind: 'name',
		path: relativePath,
		type
	})
}

async function addContentMatch(
	absolutePath: string,
	relativePath: string,
	query: string,
	matches: FindMatch[],
	limit: number,
	maxContentBytes: number
) {
	const stream = createReadStream(absolutePath, {
		highWaterMark: SEARCH_LINE_BUFFER_BYTES
	})
	let bytesRead = 0
	let lineIndex = 0

	try {
		for await (const line of streamLines(stream, SEARCH_LINE_BUFFER_BYTES)) {
			bytesRead += line.byteLength + line.terminatorLength
			if (bytesRead > maxContentBytes) break

			addLineMatch(relativePath, line.text, lineIndex, query, matches)
			lineIndex += 1

			if (matches.length >= limit) break
		}
	} catch (error) {
		reportSearchContentError(relativePath, error)
	} finally {
		stream.destroy()
	}
}

/**
 * Reports I/O or decoding failures encountered during streaming content
 * matching. Mirrors the behavior of the previous `readFile(...).catch(() =>
 * null)` path: the file is silently skipped so the overall search continues,
 * but the cause is surfaced through the server's standard error logger so
 * operators can diagnose persistent failures.
 */
function reportSearchContentError(relativePath: string, error: unknown) {
	const message = error instanceof Error ? error.message : String(error)
	console.error(`[fs/search] skipped ${relativePath}: ${message}`)
}

type StreamedLine = {
	text: string
	byteLength: number
	terminatorLength: number
}

const LINE_FEED = 0x0a
const CARRIAGE_RETURN = 0x0d

/**
 * Streams UTF-8 lines from a byte-oriented readable stream while holding at
 * most a single bounded buffer of `maxLineBytes` plus one incoming chunk in
 * memory.
 *
 * Lines are split at LF (`\n`) boundaries; a preceding CR (`\r`) — whether in
 * the same chunk or at the tail of the previous chunk — is treated as part of
 * a CRLF terminator and stripped from the emitted `text`. The terminator
 * length (1 for LF, 2 for CRLF, 0 for a trailing unterminated line or an
 * over-long line segment) is reported so callers can track cumulative bytes
 * consumed from the underlying stream.
 *
 * When a single logical line exceeds `maxLineBytes`, the full buffer is
 * emitted with `terminatorLength: 0` and scanning continues for the
 * remainder of the line. This keeps worst-case resident memory at one buffer
 * regardless of input size while still allowing matches on byte positions
 * that fall within the emitted segments.
 *
 * Invalid UTF-8 sequences decode to the Unicode replacement character via
 * the default non-fatal `TextDecoder` policy, consistent with the
 * previous `readFile(absolutePath, 'utf8')` behavior.
 */
async function* streamLines(
	stream: Readable,
	maxLineBytes: number
): AsyncGenerator<StreamedLine> {
	const decoder = new TextDecoder('utf-8')
	let pending: Buffer = Buffer.alloc(0)

	for await (const chunk of stream) {
		let remaining = chunk as Buffer

		while (remaining.length > 0) {
			const lfIndex = remaining.indexOf(LINE_FEED)

			if (lfIndex === -1) {
				const room = maxLineBytes - pending.length

				if (remaining.length <= room) {
					pending =
						pending.length === 0 ? remaining : Buffer.concat([pending, remaining])
					break
				}

				if (room > 0) {
					pending =
						pending.length === 0
							? remaining.subarray(0, room)
							: Buffer.concat([pending, remaining.subarray(0, room)])
				}

				yield {
					text: decoder.decode(pending),
					byteLength: pending.length,
					terminatorLength: 0
				}
				pending = Buffer.alloc(0)
				remaining = remaining.subarray(room)
				continue
			}

			const hasPendingCr =
				lfIndex === 0 &&
				pending.length > 0 &&
				pending[pending.length - 1] === CARRIAGE_RETURN
			const hasChunkCr =
				lfIndex > 0 && remaining[lfIndex - 1] === CARRIAGE_RETURN

			let lineBytes: Buffer
			if (hasChunkCr) {
				lineBytes =
					pending.length === 0
						? remaining.subarray(0, lfIndex - 1)
						: Buffer.concat([pending, remaining.subarray(0, lfIndex - 1)])
			} else if (hasPendingCr) {
				lineBytes = pending.subarray(0, pending.length - 1)
			} else {
				lineBytes =
					pending.length === 0
						? remaining.subarray(0, lfIndex)
						: Buffer.concat([pending, remaining.subarray(0, lfIndex)])
			}

			yield {
				text: decoder.decode(lineBytes),
				byteLength: lineBytes.length,
				terminatorLength: hasChunkCr || hasPendingCr ? 2 : 1
			}

			pending = Buffer.alloc(0)
			remaining = remaining.subarray(lfIndex + 1)
		}
	}

	if (pending.length > 0) {
		yield {
			text: decoder.decode(pending),
			byteLength: pending.length,
			terminatorLength: 0
		}
	}
}

function addLineMatch(
	relativePath: string,
	line: string,
	index: number,
	query: string,
	matches: FindMatch[]
) {
	const column = line.toLocaleLowerCase().indexOf(query)
	if (column < 0) return

	matches.push({
		kind: 'content',
		path: relativePath,
		type: 'file',
		line: index + 1,
		column: column + 1,
		preview: line.trim().slice(0, 240)
	})
}

async function safeLstatInside(paths: WorkspacePaths, absolutePath: string) {
	try {
		const stats = await lstat(absolutePath)
		if (stats.isSymbolicLink()) return stats

		await assertExistingRealPathInside(paths, absolutePath)
		return await stat(absolutePath)
	} catch {
		return null
	}
}

async function safeContentStatInside(paths: WorkspacePaths, absolutePath: string) {
	try {
		await assertExistingRealPathInside(paths, absolutePath)
		return await stat(absolutePath)
	} catch {
		return null
	}
}

function joinRelative(parent: string, child: string) {
	if (!parent) return child
	return toPosix(path.join(parent, child))
}

function resultPath(rootRelativePath: string, output: string) {
	const cleanOutput = output.replace(/^\.\//, '').replace(/\/$/, '')
	if (!rootRelativePath) return toPosix(cleanOutput)

	return toPosix(path.join(rootRelativePath, cleanOutput))
}

type RgEvent = RgMatchEvent | {
	type: string
	data?: unknown
}

type RgMatchEvent = {
	type: 'match'
	data: {
		path: {
			text: string
		}
		lines: {
			text: string
		}
		line_number: number
		submatches: Array<{
			start: number
		}>
	}
}
