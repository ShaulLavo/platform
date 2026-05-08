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
import { fileSystemKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

const EMPTY_SOURCE_FILES: readonly TypeScriptLspSourceFile[] = []

export function useTypeScriptWorkspaceFiles(
  file: EditorFile,
  workspaceEntries: readonly EditorWorkspaceEntry[]
) {
  const candidates = useMemo(
    () => sourceContextCandidates(workspaceEntries, file.path),
    [file.path, workspaceEntries]
  )
  const key = workspaceCandidateKey(candidates)
  const query = useQuery({
    enabled: Boolean(key),
    gcTime: 60 * 1000,
    queryFn: ({ signal }) => loadWorkspaceSourceFiles(candidates, signal),
    queryKey: fileSystemKeys.workspaceSources(key),
    staleTime: 30 * 1000,
  })
  const loadedFiles = query.data ?? EMPTY_SOURCE_FILES

  return mergeActiveFileIntoWorkspace(file, loadedFiles)
}
