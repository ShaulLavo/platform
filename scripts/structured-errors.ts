import { createError, defineErrorCatalog } from 'evlog'

const scriptErrors = defineErrorCatalog('scripts', {
  INVALID_INPUT: {
    status: 400,
    message: ({ message }: { message: string }) => message,
    why: 'A local Platform script received invalid input or missing prerequisites.',
    fix: 'Adjust the script arguments or environment and run the command again.',
  },
})

export function createScriptError(message: string) {
  return createError({
    code: scriptErrors.INVALID_INPUT.code,
    fix: scriptErrors.INVALID_INPUT.fix,
    message,
    status: scriptErrors.INVALID_INPUT.status,
    why: scriptErrors.INVALID_INPUT.why,
  })
}
