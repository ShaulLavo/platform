import { toWorkspaceAbsolute } from '../files/path'

export function decodePath(rootPath: string, segments: readonly string[]) {
  if (segments.length === 0) return null

  const decoded = segments.map(decodeSegment)
  if (decoded.some((segment) => segment === null)) return null
  // An empty or `.` segment means the token went through a normalizer that collapsed
  // it — `f//a.ts` and `f/./a.ts` both name a DIFFERENT file than `f/a.ts`, and
  // resolving them anyway opened the wrong one rather than reporting a bad token.
  if (decoded.some((segment) => segment === '' || segment === '.')) return null

  return toWorkspaceAbsolute(rootPath, decoded.join('/'))
}

export function encodePath(relative: string) {
  return relative.split('/').map(encodeSegment).join('/')
}

export function encodeSegment(value: string) {
  return encodeURIComponent(value).replaceAll('~', '%7E').replaceAll('!', '%21')
}

export function decodeSegment(value: string | undefined) {
  if (value === undefined) return null

  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}
