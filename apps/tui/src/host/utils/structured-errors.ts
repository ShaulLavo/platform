import { createError } from 'evlog'

export function createTuiError(message: string, fix: string, cause?: Error) {
  return createError({
    code: 'TUI_FAILED',
    status: 400,
    message,
    why: cause?.message ?? message,
    fix,
    cause,
  })
}
