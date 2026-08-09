import { CHAT_ATTACHMENT_URL_PREFIX } from '@workspace/contracts'
import { Elysia } from 'elysia'

import { observeRequestOperation } from '../observability'
import { defaultAttachmentsDir, resolveAttachmentFile, type AttachmentFile } from './store'

/**
 * Blob names carry a random id and their bytes are written exactly once, so a
 * hit never needs revalidating. `private` keeps a user's screenshots out of any
 * shared cache on the way back.
 */
const ATTACHMENT_CACHE_CONTROL = 'private, max-age=31536000, immutable'

/**
 * Serves the image bytes `attachments/store.ts` wrote at turn ingest. Without
 * this the transcript can only ever name an attachment, never show it: the
 * blobs live outside the workspace root, so the filesystem routes cannot reach
 * them. The path comes from the contract, so the `<img>` src the web derives
 * and the route mounted here cannot drift apart.
 */
export function attachmentRoutes({
  attachmentsDir = defaultAttachmentsDir(),
}: { attachmentsDir?: string } = {}) {
  return new Elysia({ name: 'attachment-routes' }).get(
    `${CHAT_ATTACHMENT_URL_PREFIX}/:fileName`,
    async ({ params, set }) => {
      const file = await observeRequestOperation(
        { area: 'attachments', operation: 'read' },
        () => resolveAttachmentFile({ attachmentsDir, fileName: params.fileName }),
        (result) => summarizeAttachmentFile(params.fileName, result),
      )
      if (!file) {
        set.status = 404
        return { error: { message: 'attachment unavailable' } }
      }

      return new Response(Bun.file(file.filePath), {
        headers: {
          'cache-control': ATTACHMENT_CACHE_CONTROL,
          'content-length': String(file.byteLength),
          'content-type': file.contentType,
        },
      })
    },
  )
}

function summarizeAttachmentFile(
  fileName: string,
  file: AttachmentFile | null,
): Record<string, unknown> {
  if (!file) return { available: false, fileName }

  return {
    available: true,
    byteLength: file.byteLength,
    contentType: file.contentType,
    fileName,
  }
}
