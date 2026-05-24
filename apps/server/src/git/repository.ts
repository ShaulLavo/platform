import { lstat } from 'node:fs/promises'
import path from 'node:path'

export async function gitCwdForPath(absolutePath: string) {
  try {
    const stat = await lstat(absolutePath)
    if (stat.isDirectory()) return absolutePath
  } catch {
    return path.dirname(absolutePath)
  }

  return path.dirname(absolutePath)
}

export function lexicalRepositoryRoot(cwd: string, prefix: string) {
  const segments = prefix.split('/').filter(Boolean)
  if (segments.length === 0) return cwd

  return path.resolve(cwd, ...segments.map(() => '..'))
}
