import { rename } from 'node:fs/promises'
import { FsError, mapNodeError } from './errors'
import {
  assertExistingPath,
  assertNotRootTarget,
  removeDestinationIfAllowed,
} from './mutation-target'
import type { WorkspacePaths } from './path'
import type { RenameBody } from './contracts'

export async function renamePath(paths: WorkspacePaths, body: RenameBody) {
  const from = paths.resolve(body.from)
  const to = paths.resolve(body.to)

  try {
    assertNotRootTarget(from.relativePath)
    assertNotRootTarget(to.relativePath)
    await assertExistingPath(from.absolutePath)
    await removeDestinationIfAllowed(to.absolutePath, body.overwrite)
    await rename(from.absolutePath, to.absolutePath)

    return {
      from: from.relativePath,
      to: to.relativePath,
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}
