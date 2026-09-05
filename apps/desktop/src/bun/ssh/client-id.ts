import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createSshError } from '../structured-errors'

export async function readSshClientId(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const filename = path.join(directory, 'ssh-client-id')
  try {
    await writeFile(filename, crypto.randomUUID(), { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
  }
  const clientId = (await readFile(filename, 'utf8')).trim()
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(clientId)) {
    throw createSshError(
      'settings',
      `Invalid SSH client identity. Remove ${filename} and restart the desktop app.`,
    )
  }
  return clientId
}
