import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { externalEditorExecutable, runExternalEditor } from '@/host/external-editor'
import { makeExternalEditor } from '../../../test/factories/external-editor'
import { test, expect } from '../../../test/fixtures'

test('external editor receives a private file as one argument and cleans up after success', async ({
  server,
}) => {
  const marker = path.join(server.root, 'editor-result.json')
  const executable = await makeExternalEditor(
    server.root,
    `
    const directory = (await import('node:path')).dirname(filename);
    await fs.writeFile(${JSON.stringify(marker)}, JSON.stringify({filename, args: process.argv.slice(2), fileMode: (await fs.stat(filename)).mode & 0o777, directoryMode: (await fs.stat(directory)).mode & 0o777, original: await fs.readFile(filename, 'utf8')}));
    await fs.writeFile(filename, '{"editor.fontSize":25}');
  `,
  )
  const text = await runExternalEditor({
    executable,
    text: '{}',
    signal: new AbortController().signal,
  })
  expect(text).toBe('{"editor.fontSize":25}')
  const result = JSON.parse(await readFile(marker, 'utf8'))
  expect(result).toMatchObject({ fileMode: 0o600, directoryMode: 0o700, original: '{}' })
  expect(result.args).toEqual([result.filename])
  await expect(stat(path.dirname(result.filename))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('external editor abort terminates the real process and removes its temporary file', async ({
  server,
}) => {
  const marker = path.join(server.root, 'editor-path')
  const executable = await makeExternalEditor(
    server.root,
    `await fs.writeFile(${JSON.stringify(marker)}, filename); await new Promise(() => { setInterval(() => {}, 1000) });`,
  )
  const controller = new AbortController()
  const run = runExternalEditor({ executable, text: '{}', signal: controller.signal })
  const failure = run.catch((error: unknown) => error)
  await expect.poll(() => Bun.file(marker).exists()).toBe(true)
  const filename = await readFile(marker, 'utf8')
  controller.abort()
  await expect(failure).resolves.toMatchObject({ name: 'AbortError' })
  await expect(stat(path.dirname(filename))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('editor exit errors leave no temporary file and executable configuration is never shell parsed', async ({
  server,
}) => {
  const marker = path.join(server.root, 'editor-path')
  const executable = await makeExternalEditor(
    server.root,
    `await fs.writeFile(${JSON.stringify(marker)}, filename); process.exit(7);`,
  )
  await expect(
    runExternalEditor({ executable, text: '{}', signal: new AbortController().signal }),
  ).rejects.toMatchObject({ message: 'External editor exited with status 7.' })
  const filename = await readFile(marker, 'utf8')
  await expect(stat(path.dirname(filename))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(externalEditorExecutable(' /my/editor with spaces ', 'env-editor')).toBe(
    '/my/editor with spaces',
  )
  expect(externalEditorExecutable('', 'vim --unsafe-flag')).toBe('vim --unsafe-flag')
  expect(externalEditorExecutable('', '')).toBe('vi')
})
