import { waitFor } from '@testing-library/react'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { useLanguageServerMatches } from '@/features/editor/hooks/use-language-server-matches'
import { expect, test } from '../../../../../test/fixtures'
import { renderHookWithProviders } from '../../../../../test/render'

test('returns every match for a path through the real match route', async ({ client, server }) => {
  void client
  await writeWorkspace(server.root, {
    '.oxlintrc.json': '{}',
    'biome.json': '{}',
    'eslint.config.js': 'export default []\n',
    'package.json': '{}',
    'src/file.ts': 'export const value = 1\n',
  })
  const { result } = renderHookWithProviders(() => useLanguageServerMatches('', 'src/file.ts'))

  await waitFor(() => expect(result.current).not.toBeNull())
  expect(result.current?.map((match) => match.serverId)).toEqual([
    'typescript',
    'eslint',
    'oxlint',
    'biome',
  ])
})

test('does not expose a previous path result after the target changes', async ({
  client,
  server,
}) => {
  void client
  await writeWorkspace(server.root, {
    'package.json': '{}',
    'src/file.ts': 'export const value = 1\n',
    'src/readme.md': '# Notes\n',
  })
  const { result, rerender } = renderHookWithProviders(
    ({ matchPath }) => useLanguageServerMatches('', matchPath),
    { initialProps: { matchPath: 'src/file.ts' } },
  )

  rerender({ matchPath: 'src/readme.md' })
  expect(result.current).toBeNull()
  await waitFor(() => expect(result.current).toEqual([]))
})

test('keeps the disabled result referentially stable', () => {
  const { result, rerender } = renderHookWithProviders(() =>
    useLanguageServerMatches('', 'src/file.ts', false),
  )
  const first = result.current

  rerender()

  expect(result.current).toBe(first)
})

async function writeWorkspace(root: string, files: Readonly<Record<string, string>>) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
}
