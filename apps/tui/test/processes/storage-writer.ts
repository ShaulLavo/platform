import { environmentIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { openFileStorage } from '@/storage/files'
import { recordRecentCommand } from '@/storage/recents'

const [directory, id, prefix] = process.argv.slice(2)
const storage = await openFileStorage(directory, v.parse(environmentIdSchema, id))
const start = new Promise<void>((resolve) => process.stdin.once('data', () => resolve()))
process.send?.('ready')
try {
  await start
  for (let index = 0; index < 15; index += 1) {
    storage.setItem(`${prefix}.${index}`, String(index))
    recordRecentCommand(storage, `${prefix}.command.${index}`)
  }
  await storage.flush()
} finally {
  storage.close()
}
process.exit()
