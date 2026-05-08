import type { TypeScriptLspSourceFile } from "@editor/typescript-lsp"

import type {
  EditorFile,
  EditorWorkspaceEntry,
} from "@/components/editor/types"
import {
  loadWorkspaceSourceFiles,
  mergeActiveFileIntoWorkspace,
  sourceContextCandidates,
  workspaceCandidateKey,
} from "@/components/editor/workspace-source-files"
import { useEffect, useState } from "react"

type WorkspaceLoadState = {
  key: string
  files: TypeScriptLspSourceFile[]
}

const EMPTY_WORKSPACE_LOAD: WorkspaceLoadState = { key: "", files: [] }
const EMPTY_SOURCE_FILES: readonly TypeScriptLspSourceFile[] = []

export function useTypeScriptWorkspaceFiles(
  file: EditorFile,
  workspaceEntries: readonly EditorWorkspaceEntry[]
) {
  const candidates = sourceContextCandidates(workspaceEntries, file.path)
  const key = workspaceCandidateKey(candidates)
  const [loaded, setLoaded] = useState<WorkspaceLoadState>(EMPTY_WORKSPACE_LOAD)
  const loadedFiles = loaded.key === key ? loaded.files : EMPTY_SOURCE_FILES

  useEffect(() => {
    if (!key) return

    const controller = new AbortController()
    void loadWorkspaceSourceFiles(candidates, controller.signal).then(
      (files) => {
        if (controller.signal.aborted) return
        setLoaded({ key, files })
      }
    )

    return () => controller.abort()
  }, [candidates, key])

  return mergeActiveFileIntoWorkspace(file, loadedFiles)
}
