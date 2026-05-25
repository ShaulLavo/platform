import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { initLogger } from 'evlog'

const toastError = mock()

initLogger({ silent: true, _suppressDrainWarning: true })

mock.module('sonner', () => ({
  toast: { error: toastError },
}))

const { notifyMutationError } = await import('./notify-mutation-error')

describe('notifyMutationError', () => {
  beforeEach(() => {
    toastError.mockReset()
  })

  it('toasts git RPC failures with the mapped client message', () => {
    notifyMutationError({
      value: { error: { code: 'GIT_COMMAND_FAILED' } },
    })

    expect(toastError).toHaveBeenCalledWith('Git command failed', {
      description: 'The file server could not complete the filesystem operation.',
    })
  })

  it('does not toast unknown errors', () => {
    notifyMutationError(new Error('network closed'))

    expect(toastError).not.toHaveBeenCalled()
  })
})
