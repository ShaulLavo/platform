import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { FocusServiceContext } from '@/lib/focus/providers/context'
import { FocusService } from '@/lib/focus/state/service'

type FocusProviderProps = {
  readonly children: ReactNode
  readonly ownerDocument?: Document
  readonly service?: FocusService
}

export function FocusProvider({ children, ownerDocument, service }: FocusProviderProps) {
  const [focusService] = useState(() => service ?? new FocusService())
  const targetDocument = ownerDocument ?? (typeof document === 'undefined' ? null : document)

  useEffect(() => {
    if (!targetDocument) return

    targetDocument.addEventListener('focusin', focusService.handleFocusIn, true)
    return () => targetDocument.removeEventListener('focusin', focusService.handleFocusIn, true)
  }, [focusService, targetDocument])

  return <FocusServiceContext value={focusService}>{children}</FocusServiceContext>
}
