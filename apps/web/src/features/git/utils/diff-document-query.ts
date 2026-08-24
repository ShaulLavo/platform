import { checkpointDiffQueryKey } from '@/features/chat/utils/checkpoint-diff-query'
import { blobDiffQueryKey } from '@/features/git/utils/blob-diff-query'
import type { DiffDocumentInfo } from '@/features/git/utils/diff-document'

export function diffDocumentQueryKey(info: DiffDocumentInfo) {
  if (info.kind === 'checkpoint') return checkpointDiffQueryKey(info.query)

  return blobDiffQueryKey(info.query)
}
