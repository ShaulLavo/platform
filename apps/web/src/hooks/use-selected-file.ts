import * as React from "react"

import { errorMessage, fetchFile } from "@/lib/file-server"
import type { FileResult } from "@/lib/file-system-types"
import { type KeyedLoadState, loadStateForKey } from "@/lib/load-state"

export function useSelectedFile(selectedFilePath: string | null) {
  const [fileLoad, setFileLoad] =
    React.useState<KeyedLoadState<FileResult> | null>(null)
  const fileState = loadStateForKey(fileLoad, selectedFilePath)

  React.useEffect(() => {
    if (!selectedFilePath) return

    const controller = new AbortController()

    void fetchFile(selectedFilePath, controller.signal)
      .then((file) => {
        if (controller.signal.aborted) return
        setFileLoad({
          key: selectedFilePath,
          state: { status: "ready", data: file },
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setFileLoad({
          key: selectedFilePath,
          state: { status: "error", message: errorMessage(error) },
        })
      })

    return () => controller.abort()
  }, [selectedFilePath])

  const resetFileLoad = React.useCallback(() => {
    setFileLoad(null)
  }, [])

  return { fileState, resetFileLoad }
}
