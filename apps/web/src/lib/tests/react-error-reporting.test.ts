import { vi } from 'vitest'

import { expect, test } from '../../../test/fixtures'

const { reports } = vi.hoisted(() => ({
  reports: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/client-error-reporting', () => ({
  reportClientError: (report: Record<string, unknown>) => {
    reports.push(report)
  },
}))

test('dedupes repeated reports for the same React error object', async () => {
  reports.length = 0
  const { reportReactError } = await import('@/lib/react-error-reporting')
  const error = new Error('same render error')

  reportReactError({
    error,
    errorInfo: { componentStack: 'in ThrowingChild' },
    kind: 'caught',
  })
  reportReactError({
    error,
    errorInfo: { componentStack: 'in ThrowingChild' },
    kind: 'boundary',
  })

  expect(reports).toHaveLength(1)
  expect(reports[0]).toMatchObject({
    area: 'react',
    context: {
      componentStack: 'in ThrowingChild',
      kind: 'caught',
    },
    operation: 'react.caught_error',
  })
})
