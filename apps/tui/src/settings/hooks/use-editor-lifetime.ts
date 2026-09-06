import { useLayoutEffect, useState } from 'react'

export function useEditorLifetime(onClose: () => void) {
  const [controller] = useState(() => new AbortController())
  useLayoutEffect(() => () => controller.abort(), [controller])

  return {
    signal: controller.signal,
    close() {
      if (controller.signal.aborted) return
      controller.abort()
      onClose()
    },
  }
}
