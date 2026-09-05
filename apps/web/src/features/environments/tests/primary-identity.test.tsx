import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { readWorkspaceCache } from '@/features/workspace/state/cache'
import { checkDevOrigin } from '@/features/environments/utils/dev-origin'
import { activeServerOrigin, setActiveServerOrigin, setClient } from '@/lib/client'
import { queryClientFor } from '@/lib/environments/state/query-clients'
import { useEnvironmentsStore } from '@/lib/environments/state/store'
import { createApplicationRuntime } from '@/state/application-runtime'
import { createInProcessClient, createObservedInProcessClient } from '../../../../test/client'
import { expect, test } from '../../../../test/fixtures'
import { renderApplication } from '../../../../test/render'
import { makeTestServer } from '../../../../test/server'

test('verifies the primary identity before rendering editors without a chat handshake', async ({
  server,
  client,
}) => {
  const origin = 'http://localhost:37511'
  const previousOrigin = activeServerOrigin()
  const previousState = useEnvironmentsStore.getState()
  const gate = Promise.withResolvers<void>()
  const healthStarted = Promise.withResolvers<void>()
  const requests: string[] = []
  const observed = createObservedInProcessClient(server, async (request) => {
    const path = new URL(request.url).pathname
    requests.push(path)
    if (path !== '/health') return
    healthStarted.resolve()
    await gate.promise
  })
  useEnvironmentsStore.getState().activate(origin)
  setClient(observed)
  const application = createApplicationRuntime({
    workspaceCache: readWorkspaceCache(),
    preparation: {
      appliedThemeContentHash: null,
      appliedThemeId: null,
      selectedThemeId: 'dark-plus',
      syntaxHighlightingEnabled: false,
    },
  })
  const view = renderApplication(<p>Editor ready</p>, application)
  const replacement = await makeTestServer({ filesystemWatch: false })
  try {
    await healthStarted.promise
    expect(screen.queryByText('Editor ready')).toBeNull()
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every((path) => path === '/health')).toBe(true)
    expect(useEnvironmentsStore.getState().entries[origin]?.environmentId).toBeNull()
    await act(async () => gate.resolve())
    await screen.findByText('Editor ready')
    const identity = useEnvironmentsStore.getState().entries[origin]?.environmentId
    expect(identity).toBeTruthy()
    expect(useEnvironmentsStore.getState().connectionByOrigin[origin]?.serverInstanceId).toBeNull()

    setClient(createInProcessClient(replacement))
    await act(async () => {
      await expect(checkDevOrigin(origin, new AbortController().signal)).rejects.toMatchObject({
        code: 'ENVIRONMENT_IDENTITY_DRIFT',
      })
    })
    expect(screen.queryByText('Editor ready')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('identity or protocol')
    expect(useEnvironmentsStore.getState().entries[origin]?.environmentId).toBe(identity)

    setClient(client)
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }))
    await waitFor(() => expect(screen.queryByText('Editor ready')).not.toBeNull())
  } finally {
    gate.resolve()
    view.unmount()
    application.dispose()
    queryClientFor(origin).clear()
    useEnvironmentsStore.setState(previousState, true)
    setActiveServerOrigin(previousOrigin)
    await replacement.cleanup()
  }
})
