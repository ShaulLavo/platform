import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function makeExternalEditor(root: string, body: string) {
  const filename = path.join(root, 'editor with spaces')
  await writeFile(
    filename,
    `#!/usr/bin/env bun\nconst fs = await import('node:fs/promises');\nconst filename = process.argv[2];\n${body}\n`,
    { mode: 0o700 },
  )
  return filename
}
