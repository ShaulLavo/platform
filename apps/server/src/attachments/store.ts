import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  chatAttachmentExtension,
  type ChatAttachment,
  type ChatAttachmentUpload,
} from '@workspace/contracts'

import { createInternalError } from '../observability/structured-errors'
import {
  attachmentFileName,
  mimeTypeForAttachmentFileName,
  resolveAttachmentRelativePath,
} from './utils/paths'

const DATA_URL_PATTERN = /^data:([^;,]+);base64,([\s\S]+)$/

export type AttachmentWriteResult = {
  readonly bytesWritten: number
  readonly filePath: string
}

export type AttachmentFile = {
  readonly byteLength: number
  readonly contentType: string
  readonly filePath: string
}

/**
 * Blobs live beside the SQLite metadata database (see `../db/client.ts`) so all
 * local platform state sits under one directory.
 */
export function defaultAttachmentsDir(): string {
  return path.join(homedir(), '.platform-file-picker', 'attachments')
}

export async function writeAttachmentFromDataUrl(input: {
  readonly attachmentsDir: string
  readonly attachment: ChatAttachmentUpload
}): Promise<AttachmentWriteResult> {
  const { attachment, attachmentsDir } = input

  if (!attachment.dataUrl) {
    throw createInternalError(`Attachment ${attachment.id} carries no dataUrl to persist.`)
  }
  if (!chatAttachmentExtension(attachment.mimeType)) {
    throw createInternalError(
      `Attachment ${attachment.id} has an unsupported image type: ${attachment.mimeType}.`,
    )
  }

  const payload = parseBase64DataUrl(attachment.dataUrl)
  if (!payload) {
    throw createInternalError(`Attachment ${attachment.id} has a malformed base64 data URL.`)
  }
  if (payload.mimeType !== attachment.mimeType.trim().toLowerCase()) {
    throw createInternalError(
      `Attachment ${attachment.id} data URL type ${payload.mimeType} disagrees with declared ${attachment.mimeType}.`,
    )
  }

  const filePath = attachmentFilePath({ attachmentsDir, attachment })
  if (!filePath) {
    throw createInternalError(`Attachment ${attachment.id} resolves outside the attachments root.`)
  }

  const bytes = Buffer.from(payload.base64, 'base64')
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, bytes)
  return { bytesWritten: bytes.byteLength, filePath }
}

/**
 * Null — never a throw — when the blob is unreadable. A pruned or hand-deleted
 * file has to degrade to "image dropped from the turn", not kill the turn.
 */
export async function readAttachmentBytes(input: {
  readonly attachmentsDir: string
  readonly attachment: ChatAttachment
}): Promise<Uint8Array | null> {
  const filePath = attachmentFilePath(input)
  if (!filePath) return null

  try {
    return await readFile(filePath)
  } catch {
    return null
  }
}

/**
 * Resolves a blob addressed the way a URL addresses it — by file name — to the
 * path and length a response needs. The bytes are deliberately not read: the
 * route streams the file, so a 10 MB screenshot never lands in the heap.
 *
 * Null, never a throw, for every miss. An extension outside the allowlist, a
 * name that is not a single segment inside the root, and a file that is simply
 * not there are all the same 404 to a browser.
 */
export async function resolveAttachmentFile(input: {
  readonly attachmentsDir: string
  readonly fileName: string
}): Promise<AttachmentFile | null> {
  const contentType = mimeTypeForAttachmentFileName(input.fileName)
  if (!contentType) return null

  const filePath = resolveAttachmentRelativePath({
    attachmentsDir: input.attachmentsDir,
    relativePath: input.fileName,
  })
  if (!filePath) return null
  // Blobs are written flat, so anything nested is a probe, not an attachment.
  if (path.dirname(filePath) !== path.resolve(input.attachmentsDir)) return null

  const stats = await stat(filePath).catch(() => null)
  if (!stats?.isFile()) return null

  return { byteLength: stats.size, contentType, filePath }
}

function attachmentFilePath(input: {
  readonly attachmentsDir: string
  readonly attachment: ChatAttachment
}): string | null {
  const fileName = attachmentFileName(input.attachment)
  if (!fileName) return null

  return resolveAttachmentRelativePath({
    attachmentsDir: input.attachmentsDir,
    relativePath: fileName,
  })
}

function parseBase64DataUrl(dataUrl: string): { mimeType: string; base64: string } | null {
  const match = DATA_URL_PATTERN.exec(dataUrl)
  if (!match) return null

  const [, mimeType, base64] = match
  if (!mimeType || !base64) return null
  return { mimeType: mimeType.trim().toLowerCase(), base64 }
}
