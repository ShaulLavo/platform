import { describe, expect, it } from 'vitest'

import { errorNumberField, errorStringField } from '../error-fields'

describe('error field helpers', () => {
  it('reads string fields from errors and error-like records', () => {
    const error = Object.assign(new Error('failed'), { code: 'ENOENT' })

    expect(errorStringField(error, 'code')).toBe('ENOENT')
    expect(errorStringField({ code: 'ENOENT' }, 'code')).toBe('ENOENT')
    expect(errorStringField(error, 'status')).toBeUndefined()
    expect(errorStringField(error, 'missing')).toBeUndefined()
  })

  it('reads finite number fields from errors', () => {
    const error = Object.assign(new Error('failed'), {
      code: 'ENOENT',
      retryAfter: Number.POSITIVE_INFINITY,
      status: 404,
    })

    expect(errorNumberField(error, 'status')).toBe(404)
    expect(errorNumberField(error, 'retryAfter')).toBeUndefined()
    expect(errorNumberField(error, 'code')).toBeUndefined()
  })

  it('can limit string fields while preserving either edge', () => {
    const error = Object.assign(new Error('failed'), { detail: 'abcdef' })

    expect(errorStringField(error, 'detail', { maxLength: 3 })).toBe('abc')
    expect(errorStringField(error, 'detail', { maxLength: 3, preserve: 'end' })).toBe('def')
  })
})
