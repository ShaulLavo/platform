import { beforeEach, describe, expect, it, mock } from 'bun:test'

const invalidateWorkspace = mock()
const queryClient = { invalidateQueries: mock() }

mock.module('@tanstack/react-query', () => ({
  useQueryClient: () => queryClient,
}))

mock.module('../invalidate-workspace', () => ({
  invalidateWorkspace,
}))

const { useWorkspaceInvalidation } = await import('./use-workspace-invalidation')

describe('useWorkspaceInvalidation', () => {
  beforeEach(() => {
    invalidateWorkspace.mockReset()
    queryClient.invalidateQueries.mockReset()
  })

  it('returns a callback wired to the current query client', () => {
    const invalidate = useWorkspaceInvalidation()

    invalidate()

    expect(invalidateWorkspace).toHaveBeenCalledWith(queryClient)
  })
})
