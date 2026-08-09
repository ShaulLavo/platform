import { expect, test } from '../../../../../test/fixtures'

import { MAX_COMPRESSIBLE_SOURCE_BYTES } from '@/features/chat/lib/chat-input-attachment-limits'
import {
  compressImageToByteLimit,
  MAX_IMAGE_DIMENSION,
  scaledImageDimensions,
} from '@/features/chat/lib/image-compression'

// The node project has no canvas and no codecs, so the re-encode ladder itself
// is out of reach here. What is reachable — and what actually protects the tab —
// is the geometry and the guards that run before anything is decoded.
function imageFile(sizeBytes: number, type = 'image/png') {
  const file = new File([new Uint8Array(1)], 'shot.png', { type })
  Object.defineProperty(file, 'size', { value: sizeBytes })

  return file
}

test('clamps the longest edge of a landscape image and keeps the aspect ratio', () => {
  expect(scaledImageDimensions(4000, 3000, MAX_IMAGE_DIMENSION)).toEqual({
    height: 1536,
    width: 2048,
  })
})

test('clamps the longest edge of a portrait image', () => {
  expect(scaledImageDimensions(3000, 4000, MAX_IMAGE_DIMENSION)).toEqual({
    height: 2048,
    width: 1536,
  })
})

test('never upscales an image already inside the ceiling', () => {
  expect(scaledImageDimensions(800, 600, MAX_IMAGE_DIMENSION)).toEqual({ height: 600, width: 800 })
})

test('a fallback pass below the ceiling really does shrink the image', () => {
  // The fallback steps scale the bitmap's own clamped size; scaling a fixed
  // 2048 ceiling instead would leave an 800px source untouched forever.
  expect(scaledImageDimensions(800, 600, Math.round(800 * 0.55))).toEqual({
    height: 330,
    width: 440,
  })
})

test('keeps at least one pixel on each edge for extreme aspect ratios', () => {
  expect(scaledImageDimensions(4096, 1, MAX_IMAGE_DIMENSION)).toEqual({ height: 1, width: 2048 })
})

test('degenerate dimensions do not produce a zero-sized canvas', () => {
  expect(scaledImageDimensions(0, 0, MAX_IMAGE_DIMENSION)).toEqual({ height: 1, width: 1 })
})

test('an image already under the cap passes through as the exact same File', async () => {
  const original = imageFile(1024)

  const result = await compressImageToByteLimit(original, 10 * 1024 * 1024)

  expect(result).toEqual({
    ok: true,
    file: original,
    mimeType: 'image/png',
    recompressed: false,
  })
  // Pass-through must be the same object, not a re-encoded copy.
  expect(result.ok && result.file).toBe(original)
})

test('refuses a source above the decode-safety ceiling without touching it', async () => {
  const result = await compressImageToByteLimit(
    imageFile(MAX_COMPRESSIBLE_SOURCE_BYTES + 1),
    10 * 1024 * 1024,
  )

  expect(result).toEqual({ ok: false, reason: 'too-large' })
})

test('reports too-large when the environment cannot encode at all', async () => {
  // No createImageBitmap/OffscreenCanvas here, which is exactly the capability
  // guard: an oversized image with no encoder can never be made to fit.
  const result = await compressImageToByteLimit(imageFile(20 * 1024 * 1024), 10 * 1024 * 1024)

  expect(result).toEqual({ ok: false, reason: 'too-large' })
})
