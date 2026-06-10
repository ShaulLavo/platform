import { createError, defineErrorCatalog, type ErrorOptions } from 'evlog'

type TilingStructuredErrorOptions = Omit<ErrorOptions, 'cause'> & {
  cause?: unknown
}

export const tilingErrors = defineErrorCatalog('tiling', {
  INVARIANT_ERROR: {
    status: 500,
    message: ({ message }: { message: string }) => message,
    why: 'The tiling layout model hit an invariant violation.',
    fix: 'Inspect the tiling state mutation or caller input that produced the invalid state.',
  },
})

export function createTilingInvariantError(message: string, cause?: unknown) {
  return createTilingStructuredError({
    cause,
    code: tilingErrors.INVARIANT_ERROR.code,
    fix: tilingErrors.INVARIANT_ERROR.fix,
    message,
    status: tilingErrors.INVARIANT_ERROR.status,
    why: tilingErrors.INVARIANT_ERROR.why,
  })
}

function createTilingStructuredError(options: TilingStructuredErrorOptions) {
  const { cause, ...rest } = options

  return createError({
    ...rest,
    ...(cause instanceof Error ? { cause } : {}),
    ...(cause === undefined || cause instanceof Error ? {} : { internal: { cause } }),
  })
}
