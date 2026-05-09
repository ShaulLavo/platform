import { basename, displayPath } from "@/lib/path-formatters"
import type { BlobDiffRequest, FileDiff } from "./types"

export type DiffDocumentInfo =
  | {
      id: string
      kind: "legacy"
      path: string
      staged: boolean
    }
  | {
      id: string
      kind: "snapshot"
      path: string
      query: BlobDiffRequest
    }

type SnapshotPayload = {
  newObjectId?: string
  oldObjectId?: string
  oldPath?: string
  path: string
  version: 2
}

const DIFF_DOCUMENT_PREFIX = "git-diff:"
const SNAPSHOT_SCOPE = "v2"

export function diffDocumentId(path: string, staged: boolean): string
export function diffDocumentId(diff: FileDiff): string
export function diffDocumentId(input: FileDiff | string, staged = false) {
  if (typeof input === "string") return legacyDiffDocumentId(input, staged)

  return snapshotDiffDocumentId(input)
}

export function parseDiffDocumentId(
  id: string | null | undefined
): DiffDocumentInfo | null {
  if (!id?.startsWith(DIFF_DOCUMENT_PREFIX)) return null

  const body = id.slice(DIFF_DOCUMENT_PREFIX.length)
  const separatorIndex = body.indexOf(":")
  if (separatorIndex < 0) return null

  const scope = body.slice(0, separatorIndex)
  const encoded = body.slice(separatorIndex + 1)
  if (scope === SNAPSHOT_SCOPE) return parseSnapshotDiffDocument(id, encoded)

  return parseLegacyDiffDocument(id, scope, encoded)
}

export function diffDocumentLabel(id: string) {
  const info = parseDiffDocumentId(id)
  if (!info) return basename(id)

  return `${basename(info.path)} (diff)`
}

export function diffDocumentTitle(id: string) {
  const info = parseDiffDocumentId(id)
  if (!info) return displayPath(id)

  return `${displayDiffPath(info.path)} (diff)`
}

function legacyDiffDocumentId(path: string, staged: boolean) {
  const scope = staged ? "staged" : "worktree"

  return `${DIFF_DOCUMENT_PREFIX}${scope}:${encodeURIComponent(path)}`
}

function snapshotDiffDocumentId(diff: FileDiff) {
  const payload: SnapshotPayload = {
    newObjectId: diff.newObjectId,
    oldObjectId: diff.oldObjectId,
    oldPath: diff.oldPath,
    path: diff.path,
    version: 2,
  }

  return `${DIFF_DOCUMENT_PREFIX}${SNAPSHOT_SCOPE}:${encodeURIComponent(
    JSON.stringify(payload)
  )}`
}

function parseSnapshotDiffDocument(id: string, encoded: string) {
  const payload = parseSnapshotPayload(encoded)
  if (!payload) return null

  return {
    id,
    kind: "snapshot" as const,
    path: payload.path,
    query: {
      newObjectId: payload.newObjectId,
      oldObjectId: payload.oldObjectId,
      oldPath: payload.oldPath,
      path: payload.path,
    },
  }
}

function parseSnapshotPayload(encoded: string): SnapshotPayload | null {
  try {
    const payload = JSON.parse(decodeURIComponent(encoded)) as unknown
    if (!isSnapshotPayload(payload)) return null

    return payload
  } catch {
    return null
  }
}

function isSnapshotPayload(value: unknown): value is SnapshotPayload {
  if (!value || typeof value !== "object") return false

  const payload = value as Partial<SnapshotPayload>
  if (payload.version !== 2) return false
  if (typeof payload.path !== "string") return false
  if (!optionalString(payload.oldPath)) return false
  if (!optionalString(payload.oldObjectId)) return false
  if (!optionalString(payload.newObjectId)) return false

  return Boolean(payload.oldObjectId || payload.newObjectId)
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string"
}

function parseLegacyDiffDocument(
  id: string,
  scope: string,
  encodedPath: string
) {
  if (scope !== "staged" && scope !== "worktree") return null

  try {
    const path = decodeURIComponent(encodedPath)
    return { id, kind: "legacy" as const, path, staged: scope === "staged" }
  } catch {
    return null
  }
}

function displayDiffPath(path: string) {
  if (path.startsWith("/")) return path

  return displayPath(path)
}
