import type { TypeScriptLspSourceFile } from "@editor/typescript-lsp"

import type {
  EditorFile,
  EditorWorkspaceEntry,
} from "@/components/editor/types"
import { extensionForFilePath } from "@/components/editor/file-path"
import { fsClient } from "@/lib/fs-client"

export type WorkspaceCandidate = {
  path: string
  signature: string
}

const MAX_WORKSPACE_CONTEXT_FILES = 80
const MAX_WORKSPACE_CONTEXT_BYTES = 1_500_000
const MAX_WORKSPACE_CONTEXT_FILE_BYTES = 160_000

const SOURCE_CONTEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".htm",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".markdown",
  ".md",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
])

export function sourceContextCandidates(
  entries: readonly EditorWorkspaceEntry[],
  activePath: string
) {
  const candidates: WorkspaceCandidate[] = []
  let totalBytes = 0

  for (const entry of entries) {
    if (candidates.length >= MAX_WORKSPACE_CONTEXT_FILES) break
    if (!isSourceContextEntry(entry, activePath)) continue

    const nextTotal = totalBytes + entry.size
    if (nextTotal > MAX_WORKSPACE_CONTEXT_BYTES) continue

    totalBytes = nextTotal
    candidates.push({
      path: entry.path,
      signature: `${entry.path}\u0000${entry.mtimeMs}\u0000${entry.size}`,
    })
  }

  return candidates
}

export function workspaceCandidateKey(
  candidates: readonly WorkspaceCandidate[]
) {
  return candidates.map((candidate) => candidate.signature).join("\n")
}

export async function loadWorkspaceSourceFiles(
  candidates: readonly WorkspaceCandidate[],
  signal: AbortSignal
) {
  const files = await Promise.all(
    candidates.map((candidate) =>
      fetchWorkspaceSourceFile(candidate.path, signal)
    )
  )

  return files.filter((file): file is TypeScriptLspSourceFile => Boolean(file))
}

export function mergeActiveFileIntoWorkspace(
  file: EditorFile,
  files: readonly TypeScriptLspSourceFile[]
) {
  const merged = files.filter(
    (workspaceFile) => workspaceFile.path !== file.path
  )
  return [{ path: file.path, text: file.content }, ...merged]
}

function isSourceContextEntry(entry: EditorWorkspaceEntry, activePath: string) {
  if (entry.type !== "file") return false
  if (entry.path === activePath) return false
  if (entry.size > MAX_WORKSPACE_CONTEXT_FILE_BYTES) return false

  return SOURCE_CONTEXT_EXTENSIONS.has(extensionForFilePath(entry.path))
}

async function fetchWorkspaceSourceFile(path: string, signal: AbortSignal) {
  const response = await fsClient.fs.read.get({
    query: { path },
    fetch: { signal },
  })

  if (response.error) return null
  const data = response.data as { content: string }

  return {
    path,
    text: data.content,
  } satisfies TypeScriptLspSourceFile
}
