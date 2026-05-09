import { lstat, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { FsError, mapNodeError } from './errors'
import {
	assertExistingRealPathInside,
	isIgnoredPath,
	treeIgnoredNames,
	toPosix,
	type WorkspacePaths
} from './path'
import { assertDirectory, type FsEntryType, typeFromStats } from './stat'
import type { EntryTypeFilter } from './contracts'

export type TreeEntry = {
	name: string
	path: string
	type: FsEntryType
	size: number
	mtimeMs: number
	birthtimeMs: number
	children?: TreeEntry[]
}

export type TreeResult = {
	path: string
	entries: TreeEntry[]
}

export async function readTree(
	paths: WorkspacePaths,
	input: string,
	depth = 1,
	entryType?: EntryTypeFilter
): Promise<TreeResult> {
	const target = paths.resolve(input)

	try {
		await assertExistingRealPathInside(paths, target.absolutePath)
		const stats = await stat(target.absolutePath)
		assertDirectory(stats)

		return {
			path: target.relativePath,
			entries: await readEntries(
				paths,
				target.absolutePath,
				target.relativePath,
				depth,
				entryType
			)
		}
	} catch (error) {
		if (error instanceof FsError) throw error
		throw mapNodeError(error)
	}
}

async function readEntries(
	paths: WorkspacePaths,
	absoluteDirectory: string,
	relativeDirectory: string,
	depth: number,
	entryType?: EntryTypeFilter
) {
	const dirents = await readdir(absoluteDirectory, { withFileTypes: true })
	const entries: TreeEntry[] = []

	for (const dirent of dirents) {
		const entry = await readEntry(
			paths,
			absoluteDirectory,
			relativeDirectory,
			dirent.name,
			depth,
			entryType
		)
		if (!entry) continue
		entries.push(entry)
	}

	return entries.sort(compareTreeEntries)
}

async function readEntry(
	paths: WorkspacePaths,
	absoluteDirectory: string,
	relativeDirectory: string,
	name: string,
	depth: number,
	entryType?: EntryTypeFilter
) {
	const relativePath = joinRelative(relativeDirectory, name)
	if (isIgnoredPath(relativePath, treeIgnoredNames)) return null

	const absolutePath = path.join(absoluteDirectory, name)
	const stats = await safeLstatInside(paths, absolutePath)
	if (!stats) return null

	const type = typeFromStats(stats)
	const entry: TreeEntry = {
		name,
		path: relativePath,
		type,
		size: stats.size,
		mtimeMs: stats.mtimeMs,
		birthtimeMs: stats.birthtimeMs
	}

	if (!stats.isDirectory()) return matchingEntry(entry, entryType)
	if (depth <= 1) return matchingEntry(entry, entryType)

	entry.children = await readEntries(paths, absolutePath, relativePath, depth - 1, entryType)
	return matchingEntry(entry, entryType)
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

function joinRelative(parent: string, child: string) {
	if (!parent) return child
	return toPosix(path.join(parent, child))
}

function compareTreeEntries(a: TreeEntry, b: TreeEntry) {
	if (a.type === 'directory' && b.type !== 'directory') return -1
	if (a.type !== 'directory' && b.type === 'directory') return 1

	return a.name.localeCompare(b.name)
}

function matchingEntry(entry: TreeEntry, entryType?: EntryTypeFilter) {
	if (!entryType) return entry
	if (entry.type === entryType) return entry

	return null
}
