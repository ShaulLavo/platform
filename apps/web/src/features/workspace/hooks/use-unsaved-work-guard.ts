import { useEffect } from 'react'

export function useUnsavedWorkGuard(hasUnsavedDocuments: () => boolean) {
  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedDocuments()) return
      event.preventDefault()
    }

    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [hasUnsavedDocuments])
}
