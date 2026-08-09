/**
 * What the composer will accept as an image attachment.
 *
 * The binding constraint is downstream and narrower than our own contract:
 * `chatAttachmentSchema.mimeType` allows any `image/*`, but the Claude SDK
 * accepts exactly gif/jpeg/png/webp and hard-fails the whole turn on anything
 * else. A macOS HEIC paste therefore has to be refused here, in the browser,
 * rather than surfacing as a mid-turn server error with no way back.
 */

const BYTES_PER_MEGABYTE = 1024 * 1024

/** Exactly the media types the Claude SDK accepts. Do not widen. */
export const CHAT_IMAGE_MIME_ALLOWLIST = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type ChatImageMimeType = (typeof CHAT_IMAGE_MIME_ALLOWLIST)[number]

/** Attachments per message. Beyond this the prompt is mostly pixels. */
export const MAX_CHAT_ATTACHMENTS = 8

/** Ceiling on the encoded bytes we are willing to put on the wire per image. */
export const MAX_CHAT_IMAGE_BYTES = 10 * BYTES_PER_MEGABYTE

/**
 * Ceiling on the *source* file handed to the re-encoder. File size is a proxy
 * for pixel count, and decoding hundreds of megapixels into an `ImageBitmap`
 * can OOM the tab — beyond this we refuse rather than risk it.
 */
export const MAX_COMPRESSIBLE_SOURCE_BYTES = 50 * BYTES_PER_MEGABYTE

export type ChatImageRejectionReason = 'empty' | 'too-large' | 'too-many' | 'unsupported-type'

export type ChatImageClassification =
  | {
      status: 'accept'
      /** Normalized media type — use this, not `file.type`, downstream. */
      mimeType: ChatImageMimeType
    }
  | { status: 'reject'; reason: ChatImageRejectionReason; message: string }

/**
 * Decides whether `file` can be staged, given how many images are already
 * staged. Rejections carry the sentence shown to the user, so every refusal
 * names its own cause instead of collapsing into one generic error.
 *
 * Note what is *not* rejected here: anything between `MAX_CHAT_IMAGE_BYTES` and
 * `MAX_COMPRESSIBLE_SOURCE_BYTES` is accepted and downscaled instead, so the
 * wire cap never shows up as a refusal the user cannot act on.
 */
export function classifyChatImageFile(file: File, currentCount: number): ChatImageClassification {
  const mimeType = allowedChatImageMimeType(file.type)
  if (!mimeType) {
    return {
      status: 'reject',
      reason: 'unsupported-type',
      message: 'PNG, JPEG, WebP and GIF only.',
    }
  }
  if (currentCount >= MAX_CHAT_ATTACHMENTS) {
    return {
      status: 'reject',
      reason: 'too-many',
      message: `Up to ${MAX_CHAT_ATTACHMENTS} images per message.`,
    }
  }
  if (file.size <= 0) {
    return { status: 'reject', reason: 'empty', message: 'That image is empty.' }
  }
  if (file.size > MAX_COMPRESSIBLE_SOURCE_BYTES) {
    return {
      status: 'reject',
      reason: 'too-large',
      message: `Images must be under ${MAX_COMPRESSIBLE_SOURCE_BYTES / BYTES_PER_MEGABYTE} MB.`,
    }
  }

  return { status: 'accept', mimeType }
}

/**
 * `image/jpg` is not a registered media type, but plenty of tools write it.
 * Normalizing costs two lines and saves a turn that would otherwise die at the
 * provider on a file the user reasonably believes is a JPEG.
 */
function allowedChatImageMimeType(rawMimeType: string): ChatImageMimeType | null {
  const mimeType = rawMimeType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (mimeType === 'image/jpg') return 'image/jpeg'

  return CHAT_IMAGE_MIME_ALLOWLIST.find((allowed) => allowed === mimeType) ?? null
}
