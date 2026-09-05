import { fixtureEnvironmentId } from '../../../../test/factories/chat'
import { activeServerOrigin, environmentClientFor, setActiveServerOrigin } from '@/lib/client'
import { environmentActivitySignal } from '@/lib/environments/state/activity'
import { queryClientFor } from '@/lib/environments/state/query-clients'
import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { orchestrationServerConfig } from '../../../../test/factories/orchestration-server-config'
import { expect, test } from '../../../../test/fixtures'

test('equivalent origin spellings share clients, caches, identity and activity', () => {
  const original = activeServerOrigin()
  const state = useEnvironmentsStore.getState()
  const origin = 'http://localhost:37411'
  const alias = 'http://LOCALHOST:37411/'
  try {
    useEnvironmentsStore.getState().activate(alias)
    expect(activeServerOrigin()).toBe(origin)
    expect(useEnvironmentsStore.getState().activeOrigin).toBe(origin)
    expect(environmentClientFor(alias)).toBe(environmentClientFor(origin))
    expect(queryClientFor(alias)).toBe(queryClientFor(origin))
    expect(environmentActivitySignal(alias)).toBe(environmentActivitySignal(origin))
    useEnvironmentsStore.getState().recordHandshake(alias, orchestrationServerConfig())
    expect(useEnvironmentsStore.getState().entries[origin]?.environmentId).toBe(
      fixtureEnvironmentId(1),
    )
    expect(useEnvironmentsStore.getState().entries[alias]).toBeUndefined()
    expect(() =>
      useEnvironmentsStore
        .getState()
        .recordHandshake(
          origin,
          orchestrationServerConfig({ environmentId: fixtureEnvironmentId(3) }),
        ),
    ).toThrow(expect.objectContaining({ code: 'ENVIRONMENT_IDENTITY_DRIFT' }))
  } finally {
    queryClientFor(origin).clear()
    useEnvironmentsStore.setState(state, true)
    setActiveServerOrigin(original)
  }
})
