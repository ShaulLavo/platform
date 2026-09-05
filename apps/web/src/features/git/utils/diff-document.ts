import { basename, displayPath } from '@/lib/path-formatters'
import type { SessionId } from '@workspace/contracts'
import type {
  BlobDiffRequest,
  FileDiff,
  FileStatus,
  PanelSection,
} from '@/features/git/utils/types'

export type DiffDocumentInfo =
  | {
      id: string
      kind: 'checkpoint'
      path: string
      query: CheckpointPayload
      status?: FileStatus['index'] | FileStatus['worktree']
    }
  | {
      id: string
      kind: 'snapshot'
      path: string
      query: BlobDiffRequest
      source?: PanelSection
      status?: FileStatus['index'] | FileStatus['worktree']
    }

type SnapshotPayload = {
  newObjectId?: string
  oldObjectId?: string
  oldPath?: string
  path: string
  source?: PanelSection
  status?: FileStatus['index'] | FileStatus['worktree']
  version: 2
}

type CheckpointPayload = {
  filePath?: string
  fromTurnCount: number
  newObjectId?: string
  oldObjectId?: string
  oldPath?: string
  path: string
  scope?: 'file' | 'session' | 'turn'
  status?: FileStatus['index'] | FileStatus['worktree']
  sessionId: SessionId
  toTurnCount: number
  version: 1
}

export type CheckpointDiffDocumentInput = Omit<CheckpointPayload, 'version'>
export type SnapshotDiffDocumentInput = FileDiff &
  ({ newObjectId: string } | { oldObjectId: string })

export const DIFF_DOCUMENT_PREFIX = 'git-diff:'
const SNAPSHOT_SCOPE = 'v2'
const CHECKPOINT_SCOPE = 'checkpoint-v1'

export function hasDiffDocumentSnapshot(diff: FileDiff): diff is SnapshotDiffDocumentInput {
  return Boolean(diff.oldObjectId || diff.newObjectId)
}

export function parseDiffDocumentId(id: string | null | undefined): DiffDocumentInfo | null {
  if (!id?.startsWith(DIFF_DOCUMENT_PREFIX)) return null

  const body = id.slice(DIFF_DOCUMENT_PREFIX.length)
  const separatorIndex = body.indexOf(':')
  if (separatorIndex < 0) return null

  const scope = body.slice(0, separatorIndex)
  const encoded = body.slice(separatorIndex + 1)
  if (scope === CHECKPOINT_SCOPE) return parseCheckpointDiffDocument(id, encoded)
  if (scope === SNAPSHOT_SCOPE) return parseSnapshotDiffDocument(id, encoded)

  return null
}

export function diffDocumentLabel(id: string) {
  const info = parseDiffDocumentId(id)
  if (!info) return basename(id)
  if (info.kind === 'checkpoint') return checkpointDiffLabel(info.query)

  return basename(info.path)
}

export function diffDocumentTitle(id: string) {
  const info = parseDiffDocumentId(id)
  if (!info) return displayPath(id)

  if (info.kind === 'checkpoint') {
    return checkpointDiffTitle(info.query)
  }

  const hash = snapshotShortHash(info)
  if (!hash) return `${displayDiffPath(info.path)} diff`

  return `${displayDiffPath(info.path)} diff at ${hash}`
}

export function diffDocumentShortHash(id: string) {
  const info = parseDiffDocumentId(id)
  if (!info || info.kind !== 'snapshot') return ''

  const hash = info.query.newObjectId ?? info.query.oldObjectId
  return hash?.slice(0, 7) ?? ''
}

export function checkpointDiffDocumentId(input: CheckpointDiffDocumentInput) {
  const payload: CheckpointPayload = {
    filePath: input.filePath,
    fromTurnCount: input.fromTurnCount,
    newObjectId: input.newObjectId,
    oldObjectId: input.oldObjectId,
    oldPath: input.oldPath,
    path: input.path,
    scope: input.scope,
    status: input.status,
    sessionId: input.sessionId,
    toTurnCount: input.toTurnCount,
    version: 1,
  }

  return `${DIFF_DOCUMENT_PREFIX}${CHECKPOINT_SCOPE}:${encodeURIComponent(JSON.stringify(payload))}`
}

export function snapshotDiffDocumentId(diff: SnapshotDiffDocumentInput) {
  const payload: SnapshotPayload = {
    newObjectId: diff.newObjectId,
    oldObjectId: diff.oldObjectId,
    oldPath: diff.oldPath,
    path: diff.path,
    source: diff.staged ? 'staged' : 'worktree',
    status: diffStatus(diff),
    version: 2,
  }

  return `${DIFF_DOCUMENT_PREFIX}${SNAPSHOT_SCOPE}:${encodeURIComponent(JSON.stringify(payload))}`
}

function parseSnapshotDiffDocument(id: string, encoded: string) {
  const payload = parseSnapshotPayload(encoded)
  if (!payload) return null

  return {
    id,
    kind: 'snapshot' as const,
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

function parseCheckpointDiffDocument(id: string, encoded: string) {
  const payload = parseCheckpointPayload(encoded)
  if (!payload) return null

  return {
    id,
    kind: 'checkpoint' as const,
    path: payload.path,
    query: payload,
    status: payload.status,
  }
}

function parseCheckpointPayload(encoded: string): CheckpointPayload | null {
  try {
    const payload = JSON.parse(decodeURIComponent(encoded)) as unknown
    if (!isCheckpointPayload(payload)) return null

    return payload
  } catch {
    return null
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
  if (!value || typeof value !== 'object') return false

  const payload = value as Partial<SnapshotPayload>
  if (payload.version !== 2) return false
  if (typeof payload.path !== 'string') return false
  if (!optionalString(payload.oldPath)) return false
  if (!optionalString(payload.oldObjectId)) return false
  if (!optionalString(payload.newObjectId)) return false
  if (!optionalDiffSource(payload.source)) return false
  if (!optionalDiffStatus(payload.status)) return false

  return Boolean(payload.oldObjectId || payload.newObjectId)
}

function isCheckpointPayload(value: unknown): value is CheckpointPayload {
  if (!value || typeof value !== 'object') return false

  const payload = value as Partial<CheckpointPayload>
  if (payload.version !== 1) return false
  if (typeof payload.sessionId !== 'string') return false
  if (typeof payload.path !== 'string') return false
  if (!optionalCheckpointScope(payload.scope)) return false
  if (!optionalString(payload.filePath)) return false
  if (typeof payload.fromTurnCount !== 'number') return false
  if (!Number.isInteger(payload.fromTurnCount)) return false
  if (typeof payload.toTurnCount !== 'number') return false
  if (!Number.isInteger(payload.toTurnCount)) return false
  if (!optionalString(payload.oldPath)) return false
  if (!optionalString(payload.oldObjectId)) return false
  if (!optionalString(payload.newObjectId)) return false
  if (!optionalDiffStatus(payload.status)) return false

  const fromTurnCount = payload.fromTurnCount
  const toTurnCount = payload.toTurnCount
  return fromTurnCount >= 0 && toTurnCount >= fromTurnCount
}

function checkpointDiffLabel(payload: CheckpointPayload) {
  const scope = payload.scope ?? 'file'
  if (scope === 'session') return `Session diff ${payload.toTurnCount}`
  if (scope === 'turn') return `Turn diff ${payload.fromTurnCount}-${payload.toTurnCount}`

  return basename(payload.filePath ?? payload.path)
}

function checkpointDiffTitle(payload: CheckpointPayload) {
  const scope = payload.scope ?? 'file'
  if (scope === 'session') return `Session checkpoint diff 0-${payload.toTurnCount}`
  if (scope === 'turn') {
    return `Turn checkpoint diff ${payload.fromTurnCount}-${payload.toTurnCount}`
  }
  const fromTurnCount = payload.fromTurnCount
  const toTurnCount = payload.toTurnCount

  return `${displayDiffPath(payload.filePath ?? payload.path)} checkpoint diff ${fromTurnCount}-${toTurnCount}`
}

function optionalCheckpointScope(value: unknown): value is CheckpointPayload['scope'] {
  return value === undefined || value === 'file' || value === 'session' || value === 'turn'
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === 'string'
}

function optionalDiffSource(value: unknown): value is PanelSection | undefined {
  return value === undefined || value === 'staged' || value === 'worktree'
}

function optionalDiffStatus(value: unknown): value is SnapshotPayload['status'] {
  if (value === undefined) return true

  return (
    value === 'added' ||
    value === 'deleted' ||
    value === 'ignored' ||
    value === 'modified' ||
    value === 'renamed' ||
    value === 'untracked' ||
    value === 'unmodified' ||
    value === 'conflicted'
  )
}

function displayDiffPath(path: string) {
  if (path.startsWith('/')) return path

  return displayPath(path)
}

function snapshotShortHash(info: DiffDocumentInfo) {
  if (info.kind !== 'snapshot') return ''

  const hash = info.query.newObjectId ?? info.query.oldObjectId
  return hash?.slice(0, 7) ?? ''
}

function diffStatus(diff: FileDiff): FileStatus['index'] | FileStatus['worktree'] {
  if (diff.oldPath && diff.oldPath !== diff.path) return 'renamed'
  if (diff.oldFileMissing) return diff.staged ? 'added' : 'untracked'
  if (diff.newFileMissing) return 'deleted'

  return 'modified'
}
