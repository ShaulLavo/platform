import { basename, displayPath } from "@/lib/path-formatters"
import type {
  BlobDiffRequest,
  FileDiff,
  FileStatus,
  PanelSection,
} from "./types"

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
      source?: PanelSection
      status?: FileStatus["index"] | FileStatus["worktree"]
    }

type SnapshotPayload = {
  newObjectId?: string
  oldObjectId?: string
  oldPath?: string
  path: string
  source?: PanelSection
  status?: FileStatus["index"] | FileStatus["worktree"]
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

  return basename(info.path)
}

export function diffDocumentTitle(id: string) {
  const info = parseDiffDocumentId(id)
  if (!info) return displayPath(id)

  const hash = snapshotShortHash(info)
  if (!hash) return `${displayDiffPath(info.path)} diff`

  return `${displayDiffPath(info.path)} diff at ${hash}`
}

export function diffDocumentShortHash(id: string) {
  const info = parseDiffDocumentId(id)
  if (!info || info.kind !== "snapshot") return ""

  const hash = info.query.newObjectId ?? info.query.oldObjectId
  return hash?.slice(0, 7) ?? ""
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
    source: diff.staged ? "staged" : "worktree",
    status: diffStatus(diff),
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
    source: payload.source,
    status: payload.status,
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
  if (!optionalDiffSource(payload.source)) return false
  if (!optionalDiffStatus(payload.status)) return false

  return Boolean(payload.oldObjectId || payload.newObjectId)
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string"
}

function optionalDiffSource(value: unknown): value is PanelSection | undefined {
  return value === undefined || value === "staged" || value === "worktree"
}

function optionalDiffStatus(
  value: unknown
): value is SnapshotPayload["status"] {
  if (value === undefined) return true

  return (
    value === "added" ||
    value === "deleted" ||
    value === "ignored" ||
    value === "modified" ||
    value === "renamed" ||
    value === "untracked" ||
    value === "unmodified" ||
    value === "conflicted"
  )
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

function snapshotShortHash(info: DiffDocumentInfo) {
  if (info.kind !== "snapshot") return ""

  const hash = info.query.newObjectId ?? info.query.oldObjectId
  return hash?.slice(0, 7) ?? ""
}

function diffStatus(
  diff: FileDiff
): FileStatus["index"] | FileStatus["worktree"] {
  if (diff.oldPath && diff.oldPath !== diff.path) return "renamed"
  if (diff.oldFileMissing) return diff.staged ? "added" : "untracked"
  if (diff.newFileMissing) return "deleted"

  return "modified"
}
