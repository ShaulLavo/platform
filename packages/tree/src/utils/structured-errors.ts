import { createError, defineErrorCatalog, type ErrorOptions } from 'evlog'

type TreeStructuredErrorOptions = Omit<ErrorOptions, 'cause'> & {
  cause?: unknown
}

const treeErrors = defineErrorCatalog('tree', {
  INVARIANT_ERROR: {
    status: 500,
    message: ({ message }: { message: string }) => message,
    why: 'The file tree model or renderer hit an invariant violation.',
    fix: 'Inspect the tree state mutation or caller input that produced the invalid state.',
  },
})

export function createTreeError(message: string, cause?: unknown) {
  return createTreeStructuredError({
    cause,
    code: treeErrors.INVARIANT_ERROR.code,
    fix: treeErrors.INVARIANT_ERROR.fix,
    message,
    status: treeErrors.INVARIANT_ERROR.status,
    why: treeErrors.INVARIANT_ERROR.why,
  })
}

function createTreeStructuredError(options: TreeStructuredErrorOptions) {
  const { cause, ...rest } = options

  return createError({
    ...rest,
    ...(cause instanceof Error ? { cause } : {}),
    ...(cause === undefined || cause instanceof Error ? {} : { internal: { cause } }),
  })
}
