import { afterEach, vi } from 'vitest'

import { expect, test } from '../../../test/fixtures'
import { addLifecycleFlush } from '@/lib/lifecycle-flush'

afterEach(() => {
  vi.restoreAllMocks()
})

test('flushes on pagehide and hidden visibility, then removes both listeners', () => {
  const flush = vi.fn()
  const visibilityState = vi.spyOn(document, 'visibilityState', 'get')
  visibilityState.mockReturnValue('visible')
  const remove = addLifecycleFlush(flush)

  document.dispatchEvent(new Event('visibilitychange'))
  expect(flush).not.toHaveBeenCalled()

  visibilityState.mockReturnValue('hidden')
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('pagehide'))
  expect(flush).toHaveBeenCalledTimes(2)

  remove()
  document.dispatchEvent(new Event('visibilitychange'))
  window.dispatchEvent(new Event('pagehide'))
  expect(flush).toHaveBeenCalledTimes(2)
})
