import { lstat, stat } from 'node:fs/promises'
import { FsError, mapNodeError } from './errors'
import { assertExistingRealPathInside, type WorkspacePaths } from './path'

export type FsEntryType = 'file' | 'directory' | 'symlink' | 'other'

export type FsStat = {
	path: string
	type: FsEntryType
	size: number
	mtimeMs: number
	birthtimeMs: number
}

export async function statPath(paths: WorkspacePaths, input: string): Promise<FsStat> {
	const target = paths.resolve(input)

	try {
		await assertExistingRealPathInside(paths, target.absolutePath)
		const stats = await stat(target.absolutePath)

		return {
			path: target.relativePath,
			type: typeFromStats(stats),
			size: stats.size,
			mtimeMs: stats.mtimeMs,
			birthtimeMs: stats.birthtimeMs
		}
	} catch (error) {
		throw mapNodeError(error)
	}
}

export async function lstatPath(paths: WorkspacePaths, input: string) {
	const target = paths.resolve(input)

	try {
		const stats = await lstat(target.absolutePath)
		return { target, stats }
	} catch (error) {
		throw mapNodeError(error)
	}
}

export function typeFromStats(stats: Awaited<ReturnType<typeof stat>>): FsEntryType {
	if (stats.isFile()) return 'file'
	if (stats.isDirectory()) return 'directory'
	if (stats.isSymbolicLink()) return 'symlink'

	return 'other'
}

export function assertFile(stats: Awaited<ReturnType<typeof stat>>) {
	if (stats.isFile()) return
	throw new FsError('NOT_A_FILE')
}

export function assertDirectory(stats: Awaited<ReturnType<typeof stat>>) {
	if (stats.isDirectory()) return
	throw new FsError('NOT_A_DIRECTORY')
}
