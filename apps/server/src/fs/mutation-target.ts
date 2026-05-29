import type { Stats } from 'node:fs'
import { lstat, rm, stat } from 'node:fs/promises'
import { FsError, nodeErrorCode } from './errors'

/**
 * Shared destructive-target and existence-probe policy for filesystem mutation
 * operations (copy, rename, write, create). Each operation keeps its own
 * mutation logic but reuses these guards so the policy stays consistent.
 */

export function assertNotRootTarget(relativePath: string) {
  if (relativePath) return

  throw new FsError('INVALID_PATH', 'operation cannot target the workspace root')
}

export async function assertExistingPath(absolutePath: string) {
  await lstat(absolutePath)
}

export async function destinationExists(absolutePath: string) {
  return (await lstatOptional(absolutePath)) !== null
}

export async function statOptional(absolutePath: string): Promise<Stats | null> {
  return statSafely(() => stat(absolutePath))
}

export async function lstatOptional(absolutePath: string): Promise<Stats | null> {
  return statSafely(() => lstat(absolutePath))
}

export async function removeDestinationIfAllowed(absolutePath: string, overwrite?: boolean) {
  if (!(await destinationExists(absolutePath))) return
  if (!overwrite) throw new FsError('ALREADY_EXISTS')

  await rm(absolutePath, { recursive: true, force: false })
}

async function statSafely(read: () => Promise<Stats>): Promise<Stats | null> {
  try {
    return await read()
  } catch (error) {
    if (nodeErrorCode(error) === 'ENOENT') return null
    throw error
  }
}
