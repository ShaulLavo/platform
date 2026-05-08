export type FsErrorCode =
	| 'PATH_OUTSIDE_WORKSPACE'
	| 'NOT_FOUND'
	| 'ALREADY_EXISTS'
	| 'FILE_CHANGED'
	| 'INVALID_PATH'
	| 'NOT_A_FILE'
	| 'NOT_A_DIRECTORY'
	| 'FILE_TOO_LARGE'
	| 'OPERATION_FAILED'

const statusByCode: Record<FsErrorCode, number> = {
	PATH_OUTSIDE_WORKSPACE: 403,
	NOT_FOUND: 404,
	ALREADY_EXISTS: 409,
	FILE_CHANGED: 409,
	INVALID_PATH: 400,
	NOT_A_FILE: 400,
	NOT_A_DIRECTORY: 400,
	FILE_TOO_LARGE: 413,
	OPERATION_FAILED: 500
}

const messageByCode: Record<FsErrorCode, string> = {
	PATH_OUTSIDE_WORKSPACE: 'path is outside the workspace',
	NOT_FOUND: 'file not found',
	ALREADY_EXISTS: 'target already exists',
	FILE_CHANGED: 'file changed on disk',
	INVALID_PATH: 'invalid path',
	NOT_A_FILE: 'path is not a file',
	NOT_A_DIRECTORY: 'path is not a directory',
	FILE_TOO_LARGE: 'file is too large',
	OPERATION_FAILED: 'filesystem operation failed'
}

export class FsError extends Error {
	readonly code: FsErrorCode
	readonly statusCode: number

	constructor(code: FsErrorCode, message = messageByCode[code]) {
		super(message)
		this.name = 'FsError'
		this.code = code
		this.statusCode = statusByCode[code]
	}
}

export function isFsError(error: unknown): error is FsError {
	return error instanceof FsError
}

export function mapNodeError(error: unknown): FsError {
	const code = nodeErrorCode(error)

	if (code === 'ENOENT') return new FsError('NOT_FOUND')
	if (code === 'EEXIST') return new FsError('ALREADY_EXISTS')
	if (code === 'ENOTDIR') return new FsError('NOT_A_DIRECTORY')
	if (code === 'EISDIR') return new FsError('NOT_A_FILE')

	return new FsError('OPERATION_FAILED')
}

export function errorPayload(error: FsError) {
	return {
		error: {
			code: error.code,
			message: error.message
		}
	}
}

function nodeErrorCode(error: unknown) {
	if (!error || typeof error !== 'object') return null
	if (!('code' in error)) return null

	const code = error.code
	return typeof code === 'string' ? code : null
}
