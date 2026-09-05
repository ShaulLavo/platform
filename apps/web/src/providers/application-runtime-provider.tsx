import type { ReactNode } from 'react'

import { useUnsavedWorkGuard } from '@/features/workspace/hooks/use-unsaved-work-guard'
import { ApplicationRuntimeContext } from '@/providers/application-runtime-context'
import type { ApplicationRuntime } from '@/state/application-runtime'

export function ApplicationRuntimeProvider({
  application,
  children,
}: {
  readonly application: ApplicationRuntime
  readonly children: ReactNode
}) {
  useUnsavedWorkGuard(application.hasUnsavedDocuments)
  return <ApplicationRuntimeContext value={application}>{children}</ApplicationRuntimeContext>
}
