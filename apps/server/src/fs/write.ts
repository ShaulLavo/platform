import { randomUUID } from 'node:crypto'
import { rm, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { FsError, mapNodeError } from './errors'
import {
	assertExistingRealPathInside,
	assertParentRealPathInside,
	type WorkspacePaths
} from './path'
import { assertFile } from './stat'
import type { WriteBody } from './contracts'

export async function writeTextFile(paths: WorkspacePaths, body: WriteBody) {
	const target = paths.resolve(body.path)
	const tempPath = path.join(
		path.dirname(target.absolutePath),
		`.${path.basename(target.absolutePath)}.${randomUUID()}.tmp`
	)

	try {
		await assertParentRealPathInside(paths, target.absolutePath)
		await assertWritableTarget(paths, target.absolutePath, body.expectedMtimeMs)
		await writeFile(tempPath, body.content, 'utf8')
		await rename(tempPath, target.absolutePath)
		return target.relativePath
	} catch (error) {
		await removeTempFile(tempPath)
		if (error instanceof FsError) throw error
		throw mapNodeError(error)
	}
}

async function assertWritableTarget(
	paths: WorkspacePaths,
	absolutePath: string,
	expectedMtimeMs?: number
) {
	const stats = await statOptional(paths, absolutePath)
	if (!stats) return

	assertFile(stats)
	if (expectedMtimeMs === undefined) return
	if (Math.abs(stats.mtimeMs - expectedMtimeMs) <= 1) return

	throw new FsError('FILE_CHANGED')
}

async function statOptional(paths: WorkspacePaths, absolutePath: string) {
	try {
		await assertExistingRealPathInside(paths, absolutePath)
		return await stat(absolutePath)
	} catch (error) {
		if (nodeErrorCode(error) === 'ENOENT') return null
		throw error
	}
}

async function removeTempFile(tempPath: string) {
	try {
		await rm(tempPath, { force: true })
	} catch {
		return
	}
}

function nodeErrorCode(error: unknown) {
	if (!error || typeof error !== 'object') return null
	if (!('code' in error)) return null

	const code = error.code
	return typeof code === 'string' ? code : null
}
