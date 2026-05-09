import { basename, displayPath } from "@/lib/path-formatters"

export type DiffDocumentInfo = {
  id: string
  path: string
  staged: boolean
}

const DIFF_DOCUMENT_PREFIX = "git-diff:"

export function diffDocumentId(path: string, staged: boolean) {
  const scope = staged ? "staged" : "worktree"

  return `${DIFF_DOCUMENT_PREFIX}${scope}:${encodeURIComponent(path)}`
}

export function parseDiffDocumentId(
  id: string | null | undefined
): DiffDocumentInfo | null {
  if (!id?.startsWith(DIFF_DOCUMENT_PREFIX)) return null

  const body = id.slice(DIFF_DOCUMENT_PREFIX.length)
  const separatorIndex = body.indexOf(":")
  if (separatorIndex < 0) return null

  const scope = body.slice(0, separatorIndex)
  const encodedPath = body.slice(separatorIndex + 1)
  if (scope !== "staged" && scope !== "worktree") return null

  try {
    const path = decodeURIComponent(encodedPath)
    return { id, path, staged: scope === "staged" }
  } catch {
    return null
  }
}

export function diffDocumentLabel(id: string) {
  const info = parseDiffDocumentId(id)
  if (!info) return basename(id)

  return `${basename(info.path)} (diff)`
}

export function diffDocumentTitle(id: string) {
  const info = parseDiffDocumentId(id)
  if (!info) return displayPath(id)

  const scope = info.staged ? "staged" : "working tree"
  return `${displayPath(info.path)} (${scope} diff)`
}
