import { useCallback, useEffect, useMemo, useState } from "react"

import { createEditorSyntaxHighlightingPlugins } from "@/features/editor/editor-plugins"
import type { SearchResultDeferredPluginMode } from "@/features/search/search-result-editor-types"

export function useSearchResultDeferredPlugins({
  mode,
  resultKey,
  rowCount,
}: {
  mode: SearchResultDeferredPluginMode
  resultKey: string | null
  rowCount: number
}) {
  const deferKey = `${resultKey ?? ""}:${rowCount}`
  const [deferredSyntax, setDeferredSyntax] = useState({
    key: "",
    ready: false,
  })
  const ready =
    mode === "immediate" ||
    (deferredSyntax.key === deferKey && deferredSyntax.ready)
  const enable = useCallback(() => {
    setDeferredSyntax((current) => {
      if (current.key === deferKey && current.ready) return current

      return { key: deferKey, ready: true }
    })
  }, [deferKey])

  useEffect(() => {
    if (mode !== "idle") return
    if (ready) return

    return scheduleSearchResultSyntaxEnable(enable)
  }, [enable, mode, ready])

  const syntaxPlugins = useMemo(() => {
    if (!ready) return []

    return createEditorSyntaxHighlightingPlugins()
  }, [ready])

  return {
    enable,
    ready,
    syntaxPlugins,
  }
}

function scheduleSearchResultSyntaxEnable(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 800 })
    return () => window.cancelIdleCallback(id)
  }

  const id = globalThis.setTimeout(callback, 120)
  return () => globalThis.clearTimeout(id)
}
