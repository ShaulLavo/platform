import { cp } from 'node:fs/promises'
import { FsError, mapNodeError } from './errors'
import {
  assertExistingPath,
  assertNotRootTarget,
  removeDestinationIfAllowed,
} from './mutation-target'
import type { WorkspacePaths } from './path'
import type { CopyBody } from './contracts'

export async function copyPath(paths: WorkspacePaths, body: CopyBody) {
  const from = paths.resolve(body.from)
  const to = paths.resolve(body.to)

  try {
    assertNotRootTarget(to.relativePath)
    await assertExistingPath(from.absolutePath)
    await removeDestinationIfAllowed(to.absolutePath, body.overwrite)
    await cp(from.absolutePath, to.absolutePath, {
      recursive: Boolean(body.recursive),
      errorOnExist: !body.overwrite,
      force: Boolean(body.overwrite),
    })

    return {
      from: from.relativePath,
      to: to.relativePath,
    }
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}
