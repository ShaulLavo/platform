import { emptyAddress, formatAddress } from '@workspace/client-core/address/grammar'
import { workspaceSlug } from '@workspace/client-core/address/slug'
import { readServerPaths } from '@workspace/client-core/files/read'
import { environmentIdSchema } from '@workspace/contracts'
import * as v from 'valibot'

import { fileAddress, resolveAddress, settingsAddress } from '@/navigation/utils/address'
import { test, expect } from '../../../test/fixtures'

const environmentId = v.parse(environmentIdSchema, '11111111-1111-4111-8111-111111111111')

test('settings addresses round-trip filters and reject foreign environments', async ({
  client,
}) => {
  const signal = new AbortController().signal
  const own = settingsAddress(environmentId, 'Appearance & motion')
  expect(await resolveAddress(own, client, environmentId, signal)).toEqual({
    kind: 'settings',
    query: 'Appearance & motion',
  })
  const foreign = own.replace(environmentId, '22222222-2222-4222-8222-222222222222')
  expect(await resolveAddress(foreign, client, environmentId, signal)).toMatchObject({
    kind: 'failed',
  })
})

test('copied file and directory addresses return to the same server path', async ({ client }) => {
  const signal = new AbortController().signal
  const paths = await readServerPaths({ client, signal })
  const filename = paths.defaultPath ? `${paths.defaultPath}/a~b!.ts` : 'a~b!.ts'
  const file = fileAddress(environmentId, filename, paths.defaultPath)
  const directory = fileAddress(environmentId, paths.defaultPath, paths.defaultPath)
  expect(await resolveAddress(file!, client, environmentId, signal)).toEqual({
    kind: 'file',
    path: filename,
  })
  expect(await resolveAddress(directory!, client, environmentId, signal)).toEqual({
    kind: 'file',
    path: paths.defaultPath,
  })
  expect(fileAddress(environmentId, '../secret', paths.defaultPath)).toBeNull()
})

test('resolves a file address through real server paths without changing the active project', async ({
  client,
}) => {
  const signal = new AbortController().signal
  const paths = await readServerPaths({ client, signal })
  const address = formatAddress({
    ...emptyAddress(),
    environmentId,
    workspace: workspaceSlug(paths.defaultPath, [paths.defaultPath]),
    mode: 'workbench',
    document: 'f/a%7Eb%21.ts',
  })
  expect(await resolveAddress(address, client, environmentId, signal)).toEqual({
    kind: 'file',
    path: paths.defaultPath ? `${paths.defaultPath}/a~b!.ts` : 'a~b!.ts',
  })
  expect(await readServerPaths({ client, signal })).toEqual(paths)
})

test('unavailable screen types and escaped traversal cannot become file requests', async ({
  client,
}) => {
  const signal = new AbortController().signal
  expect(
    await resolveAddress('/~Workspace/chat/t/new', client, environmentId, signal),
  ).toMatchObject({ kind: 'failed' })
  expect(
    await resolveAddress('/~Workspace/workbench/f/%2E%2E/secret', client, environmentId, signal),
  ).toMatchObject({ kind: 'failed' })
})
