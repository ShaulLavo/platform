import type { ErrorInfo } from 'react'

import { reportClientError } from './client-error-reporting'

type ReactErrorKind = 'boundary' | 'caught' | 'recoverable' | 'uncaught'

export type ReactErrorReportInput = {
  error: unknown
  errorInfo?: Pick<ErrorInfo, 'componentStack'>
  kind: ReactErrorKind
}

const reportedErrorObjects = new WeakSet<object>()
const reportedPrimitiveSignatures = new Set<string>()
const maxPrimitiveSignatures = 100

export function reportReactError(input: ReactErrorReportInput): void {
  if (alreadyReported(input.error)) return

  reportClientError({
    area: 'react',
    cause: input.error,
    context: reactErrorContext(input),
    message: reactErrorMessage(input.kind),
    operation: reactErrorOperation(input.kind),
  })
}

export function reactErrorDisplayName(error: unknown) {
  if (error instanceof Error) return error.name || 'Error'

  return 'Error'
}

export function reactErrorDisplayMessage(error: unknown) {
  if (error instanceof Error) return error.message || 'React render failed.'
  if (typeof error === 'string' && error.trim()) return error.trim()

  return 'React render failed.'
}

export function reactErrorStackTrace(
  error: unknown,
  errorInfo?: Pick<ErrorInfo, 'componentStack'> | null,
) {
  const stack = errorStackText(error)
  const componentStack = errorInfo?.componentStack?.trim()

  return [stackSection('Error stack', stack), stackSection('React component stack', componentStack)]
    .filter((section): section is string => Boolean(section))
    .join('\n\n')
}

function alreadyReported(error: unknown) {
  if (error !== null && typeof error === 'object') return alreadyReportedObject(error)

  return alreadyReportedPrimitive(error)
}

function alreadyReportedObject(error: object) {
  if (reportedErrorObjects.has(error)) return true

  reportedErrorObjects.add(error)
  return false
}

function alreadyReportedPrimitive(error: unknown) {
  const signature = `${typeof error}:${String(error)}`
  if (reportedPrimitiveSignatures.has(signature)) return true

  if (reportedPrimitiveSignatures.size >= maxPrimitiveSignatures) {
    reportedPrimitiveSignatures.clear()
  }

  reportedPrimitiveSignatures.add(signature)
  return false
}

function reactErrorContext(input: ReactErrorReportInput) {
  const context: Record<string, unknown> = {
    kind: input.kind,
  }
  const componentStack = input.errorInfo?.componentStack?.trim()
  if (!componentStack) return context

  return {
    ...context,
    componentStack,
  }
}

function reactErrorMessage(kind: ReactErrorKind) {
  if (kind === 'recoverable') return 'React recovered from a runtime error.'
  if (kind === 'uncaught') return 'React reported an uncaught runtime error.'

  return 'React render error caught by an error boundary.'
}

function reactErrorOperation(kind: ReactErrorKind) {
  if (kind === 'boundary') return 'react.error_boundary'
  if (kind === 'caught') return 'react.caught_error'
  if (kind === 'recoverable') return 'react.recoverable_error'

  return 'react.uncaught_error'
}

function errorStackText(error: unknown) {
  if (error instanceof Error && error.stack) return error.stack.trim()
  if (error instanceof Error) return error.message.trim()
  if (typeof error === 'string') return error.trim()

  return ''
}

function stackSection(title: string, stack: string | undefined) {
  if (!stack) return ''

  return `${title}\n${stack}`
}
