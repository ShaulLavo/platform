/**
 * Downscale + re-encode for pasted or dropped images that are too big for the
 * wire. The point is to shrink instead of refuse: a retina screenshot is
 * routinely over the per-image cap, and rejecting it teaches the user that
 * pasting images does not work.
 *
 * Browser APIs only — `createImageBitmap` + `OffscreenCanvas`. No React, no
 * module-level mutable state.
 */

import {
  MAX_COMPRESSIBLE_SOURCE_BYTES,
  type ChatImageMimeType,
} from './chat-input-attachment-limits'

/**
 * Longest edge kept when an image has to be re-encoded. Sized so a typical
 * retina screenshot (3024px wide) stays legible rather than being halved.
 */
export const MAX_IMAGE_DIMENSION = 2048

/**
 * Quality ladder walked in order until the encoded image fits the budget. The
 * floor stays high enough to avoid visible blocking on UI screenshots; if even
 * that overflows we drop resolution instead of quality.
 */
const QUALITY_LADDER = [0.92, 0.85, 0.78, 0.68] as const

/** Extra downscale passes applied when even the lowest quality overflows. */
const FALLBACK_SCALE_STEPS = [0.75, 0.55] as const

export type ImageCompressionFailureReason = 'too-large' | 'unreadable'

export type CompressImageResult =
  | {
      ok: true
      file: File
      /** Media type of `file` — always inside the chat image allowlist. */
      mimeType: string
      /** False when the original bytes passed through untouched. */
      recompressed: boolean
    }
  | { ok: false; reason: ImageCompressionFailureReason }

/**
 * Shrinks `file` until its encoded size fits `maxBytes`, returning a new WebP
 * or JPEG `File`. Files already within the limit pass through byte-for-byte,
 * preserving their exact pixels and format (and PNG transparency).
 */
export async function compressImageToByteLimit(
  file: File,
  maxBytes: number,
): Promise<CompressImageResult> {
  if (file.size <= maxBytes) {
    return { ok: true, file, mimeType: file.type, recompressed: false }
  }
  // Decoding is the risk, so no amount of output budget makes a source this
  // large safe to touch.
  if (file.size > MAX_COMPRESSIBLE_SOURCE_BYTES) return { ok: false, reason: 'too-large' }
  // Without an encoder there is no path to a smaller file, which for the caller
  // is indistinguishable from an image that refused to shrink.
  if (!canEncodeImages()) return { ok: false, reason: 'too-large' }

  const bitmap = await decodeImage(file)
  if (!bitmap) return { ok: false, reason: 'unreadable' }

  try {
    const encoded = await encodeUnderByteLimit(bitmap, maxBytes)
    if (!encoded) return { ok: false, reason: 'too-large' }

    return {
      ok: true,
      file: new File([encoded.blob], compressedFileName(file.name, encoded.mimeType), {
        type: encoded.mimeType,
      }),
      mimeType: encoded.mimeType,
      recompressed: true,
    }
  } finally {
    bitmap.close()
  }
}

/** Fits `width`x`height` inside `maxDimension` on its longest edge. */
export function scaledImageDimensions(width: number, height: number, maxDimension: number) {
  const longestEdge = Math.max(width, height)
  if (longestEdge <= 0) return { height: 1, width: 1 }

  const scale = Math.min(1, maxDimension / longestEdge)

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

type EncodedImage = { blob: Blob; mimeType: ChatImageMimeType }

async function encodeUnderByteLimit(bitmap: ImageBitmap, maxBytes: number) {
  // Each fallback pass shrinks relative to the bitmap's own clamped size rather
  // than a fixed 2048 ceiling: scaling the ceiling would be a no-op for images
  // already smaller than it, so the fallback passes would never reduce anything.
  const baseDimension = Math.min(MAX_IMAGE_DIMENSION, Math.max(bitmap.width, bitmap.height))

  for (const dimensionScale of [1, ...FALLBACK_SCALE_STEPS]) {
    const dimension = Math.max(1, Math.round(baseDimension * dimensionScale))
    const encoded = await encodeAtDimension(bitmap, dimension, maxBytes)
    if (!encoded) continue

    return encoded
  }

  return null
}

async function encodeAtDimension(
  bitmap: ImageBitmap,
  maxDimension: number,
  maxBytes: number,
): Promise<EncodedImage | null> {
  const { height, width } = scaledImageDimensions(bitmap.width, bitmap.height, maxDimension)
  const canvas = createCanvas(width, height)
  if (!canvas) return null

  const context = canvas.getContext('2d')
  if (!context) return null

  // Probe the codec before drawing: JPEG has no alpha, so it needs a white
  // matte painted underneath, and we only know whether we need one after we
  // learn whether WebP is available.
  const mimeType = await preferredEncoding(canvas)
  if (mimeType === 'image/jpeg') {
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
  }
  context.drawImage(bitmap, 0, 0, width, height)

  for (const quality of QUALITY_LADDER) {
    const blob = await encodeCanvas(canvas, mimeType, quality)
    if (!blob) continue
    if (blob.size > maxBytes) continue

    return { blob, mimeType }
  }

  return null
}

/**
 * WebP is preferred: at matched visual quality it lands roughly 25-35% smaller
 * than JPEG, so the same budget buys more resolution — and it keeps alpha, so
 * screenshots with transparency survive intact. Browsers that cannot encode it
 * hand back a differently-typed blob, which is our signal to fall back.
 */
async function preferredEncoding(canvas: OffscreenCanvas): Promise<ChatImageMimeType> {
  const probe = await encodeCanvas(canvas, 'image/webp', QUALITY_LADDER[0])

  return probe ? 'image/webp' : 'image/jpeg'
}

async function encodeCanvas(canvas: OffscreenCanvas, type: ChatImageMimeType, quality: number) {
  try {
    const blob = await canvas.convertToBlob({ quality, type })
    if (blob.type && blob.type !== type) return null

    return blob
  } catch {
    // The codec itself can throw, often precisely because the target is too
    // big. Swallow it so the smaller fallback passes still get their turn — and
    // so nothing escapes into a caller that finalizes state after this returns.
    return null
  }
}

function createCanvas(width: number, height: number) {
  try {
    return new OffscreenCanvas(width, height)
  } catch {
    // Allocating a large surface can throw on a memory-pressured tab.
    return null
  }
}

async function decodeImage(file: File) {
  try {
    return await createImageBitmap(file)
  } catch {
    return null
  }
}

function canEncodeImages() {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function'
}

/**
 * Re-encoding changes the container, so a name like `shot.png` would lie about
 * its contents. Swap the extension to match what we actually produced.
 */
function compressedFileName(name: string, mimeType: ChatImageMimeType) {
  const extension = mimeType === 'image/webp' ? '.webp' : '.jpg'
  const dotIndex = name.lastIndexOf('.')
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name

  return `${base || 'image'}${extension}`
}
