import { errorPayload, FsError } from './fs/errors'

export type AuthCapability = 'filesystem:read' | 'filesystem:write'

export type AuthPrincipal = {
	kind: 'local'
	capabilities: readonly AuthCapability[]
}

export type AuthOptions = {
	allowedOrigins?: readonly string[]
}

export type AuthConfig = {
	allowedOrigins: readonly string[]
	principal: AuthPrincipal
}

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'] as const

export const localAuthPrincipal: AuthPrincipal = {
	kind: 'local',
	capabilities: ['filesystem:read', 'filesystem:write']
}

export function createAuthConfig(options: AuthOptions = {}): AuthConfig {
	return {
		allowedOrigins: options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
		principal: localAuthPrincipal
	}
}

export function authGuard(auth: AuthConfig) {
	return ({ request, set }: { request: Request; set: { status?: number | string } }) => {
		const error = authenticateRequest(request, auth)
		if (!error) return undefined

		set.status = error.statusCode
		return errorPayload(error)
	}
}

export function authenticateRequest(request: Request, auth: AuthConfig): FsError | null {
	const originError = localBrowserOriginError(auth, request.headers.get('origin'))
	if (originError) return originError

	return null
}

export function authenticateWebSocketData(data: unknown, auth: AuthConfig): FsError | null {
	const originError = localBrowserOriginError(auth, originFromWebSocketData(data))
	if (originError) return originError

	return null
}

export function isCorsOriginAllowed(auth: AuthConfig, origin: string | null) {
	return hasTrustedOrigin(auth, origin)
}

function localBrowserOriginError(auth: AuthConfig, origin: string | null) {
	if (!origin) return new FsError('UNAUTHORIZED')
	if (hasTrustedOrigin(auth, origin)) return null

	return new FsError('FORBIDDEN_ORIGIN')
}

function hasTrustedOrigin(auth: AuthConfig, origin: string | null) {
	return !!origin && auth.allowedOrigins.includes(origin)
}

function originFromWebSocketData(data: unknown) {
	if (!isRecord(data)) return null
	if (!isRecord(data.headers)) return null

	const origin = data.headers.origin ?? data.headers.Origin
	return typeof origin === 'string' ? origin : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

// TODO(auth): This guard intentionally supports only today's local browser app:
// loopback binding plus strict Origin checks. When we add Electron/Tauri, add a
// separate native provider following T3's private bootstrap handoff instead of
// weakening this browser rule.
//
// TODO(auth): If we add remote/browser sessions later, mount Better Auth or a
// T3-style pairing flow under /auth and map successful sessions to
// AuthPrincipal/capabilities before they reach filesystem routes.
