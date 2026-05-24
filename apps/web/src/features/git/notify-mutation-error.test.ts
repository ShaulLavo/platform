import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'

const toastError = mock()
const originalConsoleError = console.error

mock.module('sonner', () => ({
  toast: { error: toastError },
}))

const { notifyMutationError } = await import('./notify-mutation-error')

describe('notifyMutationError', () => {
  beforeEach(() => {
    toastError.mockReset()
    console.error = mock()
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it('toasts git RPC failures with the mapped client message', () => {
    notifyMutationError({
      value: { error: { code: 'GIT_COMMAND_FAILED' } },
    })

    expect(console.error).toHaveBeenCalledWith('[client:git] mutation', {
      category: 'io_error',
      cause: { value: { error: { code: 'GIT_COMMAND_FAILED' } } },
      context: undefined,
      message: 'The file server could not complete the filesystem operation.',
    })
    expect(toastError).toHaveBeenCalledWith('Git command failed', {
      description: 'The file server could not complete the filesystem operation.',
    })
  })

  it('logs unknown errors without showing a toast', () => {
    notifyMutationError(new Error('network closed'))

    expect(console.error).toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })
})
