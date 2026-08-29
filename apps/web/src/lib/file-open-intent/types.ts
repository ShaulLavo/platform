import type { EditorPreparedDocument, EditorTextBuffer, PieceTableSnapshot } from '@singapor/core'
import type { FileResult } from '@/lib/file-system-types'

type PreparedOpenClaimBase = {
  readonly buffer: EditorTextBuffer
  readonly path: string
  readonly snapshot: PieceTableSnapshot
}

export type PreparedCleanFileOpenClaim = PreparedOpenClaimBase & {
  readonly file: FileResult
  readonly fileVersion: string
  readonly kind: 'clean'
  readonly preparedDocument: EditorPreparedDocument
}

export type PreparedLiveFileOpenClaim = PreparedOpenClaimBase & {
  readonly documentId: string
  readonly kind: 'live'
  readonly localRevision: number
  readonly preparedDocument: EditorPreparedDocument | null
}

export type PreparedFileOpenClaim = PreparedCleanFileOpenClaim | PreparedLiveFileOpenClaim
