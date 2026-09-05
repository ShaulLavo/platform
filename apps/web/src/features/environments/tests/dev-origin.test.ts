import { checkDevOrigin, parseDevOrigin } from '@/features/environments/utils/dev-origin'
import { activeServerOrigin, setActiveServerOrigin, setClient } from '@/lib/client'
import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { createInProcessClient } from '../../../../test/client'
import { expect, test } from '../../../../test/fixtures'
import { makeTestServer } from '../../../../test/server'
import { createIncompatibleProtocolClient } from '../../../../test/factories/incompatible-protocol-client'

test('accepts local HTTP origins and refuses remote hosts, paths and credentials', () => {
  expect(parseDevOrigin('http://localhost:3002/')).toBe('http://localhost:3002')
  expect(parseDevOrigin('http://127.0.0.1:3003')).toBe('http://127.0.0.1:3003')
  for (const origin of [
    'https://localhost:3002',
    'http://example.com:3002',
    'http://localhost.evil:3002',
    'http://user:password@localhost:3002',
    'http://localhost:3002/path',
    'http://localhost:3002/?secret=1',
    'http://localhost:3002/#path',
    'localhost:3002',
  ])
    expect(() => parseDevOrigin(origin)).toThrow(
      expect.objectContaining({ code: 'INVALID_DEV_ORIGIN' }),
    )
})

test('preflight learns real identity and refuses a replaced server before switching', async ({
  client,
}) => {
  const origin = 'http://localhost:37311'
  const previousOrigin = activeServerOrigin()
  const previousState = useEnvironmentsStore.getState()
  const replacement = await makeTestServer({ filesystemWatch: false })
  setActiveServerOrigin(origin)
  setClient(client)
  setActiveServerOrigin(previousOrigin)
  try {
    await expect(checkDevOrigin(origin, new AbortController().signal)).resolves.toBe(origin)
    expect(activeServerOrigin()).toBe(previousOrigin)
    expect(useEnvironmentsStore.getState().entries[origin]?.environmentId).toBeTruthy()
    setActiveServerOrigin(origin)
    setClient(createInProcessClient(replacement))
    setActiveServerOrigin(previousOrigin)
    await expect(checkDevOrigin(origin, new AbortController().signal)).rejects.toMatchObject({
      code: 'ENVIRONMENT_IDENTITY_DRIFT',
    })
    expect(activeServerOrigin()).toBe(previousOrigin)
  } finally {
    useEnvironmentsStore.setState(previousState, true)
    setActiveServerOrigin(previousOrigin)
    await replacement.cleanup()
  }
})

test('preflight refuses protocol 999 without switching or trusting the descriptor', async ({
  server,
}) => {
  const origin = 'http://localhost:37312'
  const previousOrigin = activeServerOrigin()
  const previousState = useEnvironmentsStore.getState()
  setActiveServerOrigin(origin)
  setClient(createIncompatibleProtocolClient(server, 999))
  setActiveServerOrigin(previousOrigin)
  try {
    await expect(checkDevOrigin(origin, new AbortController().signal)).rejects.toMatchObject({
      code: 'ENVIRONMENT_PROTOCOL_MISMATCH',
      status: 403,
    })
    expect(activeServerOrigin()).toBe(previousOrigin)
    expect(useEnvironmentsStore.getState().entries[origin]).toBeUndefined()
    expect(useEnvironmentsStore.getState().connectionByOrigin[origin]?.phase).toBe(
      'protocol-mismatch',
    )
  } finally {
    useEnvironmentsStore.setState(previousState, true)
    setActiveServerOrigin(previousOrigin)
  }
})
