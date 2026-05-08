import { errorMessage, fetchFile } from "@/lib/file-server"
import type { FileResult } from "@/lib/file-system-types"
import { type KeyedLoadState, loadStateForKey } from "@/lib/load-state"
import { useEffect, useState } from "react"

export function useSelectedFile(selectedFilePath: string | null) {
  const [fileLoad, setFileLoad] = useState<KeyedLoadState<FileResult> | null>(
    null
  )
  const fileState = loadStateForKey(fileLoad, selectedFilePath)

  useEffect(() => {
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

  function resetFileLoad() {
    setFileLoad(null)
  }

  return { fileState, resetFileLoad }
}
