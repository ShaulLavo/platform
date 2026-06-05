import { useEffect, useState } from 'react'
import type { DockviewPanelApi } from 'dockview-react'

export function useDockviewPanelActive(api: DockviewPanelApi) {
  const [active, setActive] = useState(api.isActive)

  useEffect(() => {
    setActive(api.isActive)
    const disposable = api.onDidActiveChange((event) => setActive(event.isActive))

    return () => disposable.dispose()
  }, [api])

  return active
}
