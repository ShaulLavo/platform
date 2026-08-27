import { lstat, rm } from 'node:fs/promises'
import { FsError, mapNodeError } from './errors'
import type { WorkspacePaths } from './path'
import type { DeleteBody } from './contracts'

export async function deletePath(paths: WorkspacePaths, body: DeleteBody) {
  const target = paths.resolve(body.path)

  try {
    if (!target.relativePath) throw new FsError('INVALID_PATH', 'cannot delete workspace root')

    const stats = await lstat(target.absolutePath)
    if (stats.isDirectory() && !body.recursive)
      throw new FsError('INVALID_PATH', 'directory delete requires recursive: true')

    // Not `body.recursive`: the key is always present in this literal, and `rm`
    // rejects an explicit undefined as hard as it rejects a string. A file delete
    // omits the flag, and the directory case is already answered above.
    await rm(target.absolutePath, { recursive: body.recursive === true, force: false })
    return target.relativePath
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}
