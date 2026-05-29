import { mkdir, writeFile } from 'node:fs/promises'
import { FsError, mapNodeError } from './errors'
import { assertNotRootTarget } from './mutation-target'
import type { WorkspacePaths } from './path'
import type { CreateFileBody, CreateFolderBody } from './contracts'

export async function createFile(paths: WorkspacePaths, body: CreateFileBody) {
  const target = paths.resolve(body.path)

  try {
    assertNotRootTarget(target.relativePath)
    await writeFile(target.absolutePath, body.content ?? '', {
      encoding: 'utf8',
      flag: body.overwrite ? 'w' : 'wx',
    })

    return target.relativePath
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}

export async function createFolder(paths: WorkspacePaths, body: CreateFolderBody) {
  const target = paths.resolve(body.path)

  try {
    assertNotRootTarget(target.relativePath)
    await mkdir(target.absolutePath, { recursive: body.recursive })

    return target.relativePath
  } catch (error) {
    if (error instanceof FsError) throw error
    throw mapNodeError(error)
  }
}
