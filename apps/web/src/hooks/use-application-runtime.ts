import { use } from 'react'
import { ApplicationRuntimeContext } from '@/providers/application-runtime-context'
import { createClientInvariantError } from '@/lib/structured-errors'

export function useApplicationRuntime() {
  const application = use(ApplicationRuntimeContext)
  if (!application) throw createClientInvariantError('ApplicationRuntimeProvider is missing')
  return application
}
