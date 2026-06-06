import { describe, expect, it } from 'bun:test'

import { FsError, errorPayload, mapNodeError } from '../errors'

describe('FsError', () => {
  it('maps common Node filesystem errors while sanitizing diagnostic causes', () => {
    const cause = Object.assign(new Error("ENOENT: no such file, stat '/tmp/private/file.txt'"), {
      code: 'ENOENT',
      path: '/tmp/private/file.txt',
      syscall: 'stat',
    })
    const error = mapNodeError(cause)

    expect(error.code).toBe('NOT_FOUND')
    expect(error.statusCode).toBe(404)
    expect(error.cause).toEqual({
      code: 'ENOENT',
      message: "ENOENT: no such file, stat '[redacted]'",
      name: 'Error',
      path: '[redacted]',
      syscall: 'stat',
    })
  })

  it('keeps public error payloads stable', () => {
    const error = new FsError('OPERATION_FAILED', 'failed internally', {
      detail: 'private',
    })

    expect(errorPayload(error)).toEqual({
      error: {
        code: 'OPERATION_FAILED',
        message: 'failed internally',
      },
    })
  })
})
