import { createError, defineErrorCatalog } from 'evlog'

const preloadErrors = defineErrorCatalog('desktop.preload', {
  INTERNAL_ERROR: {
    status: 500,
    message: ({ message }: { message: string }) => message,
    why: 'A preload invariant failed while exposing the desktop bridge.',
    fix: 'Inspect preload initialization and ensure the RPC bridge is available.',
  },
})

export function createDesktopError(message: string) {
  return createError({
    code: preloadErrors.INTERNAL_ERROR.code,
    fix: preloadErrors.INTERNAL_ERROR.fix,
    message,
    status: preloadErrors.INTERNAL_ERROR.status,
    why: preloadErrors.INTERNAL_ERROR.why,
  })
}
