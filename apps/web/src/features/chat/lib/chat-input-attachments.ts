import { createClientInvariantError } from '@/lib/structured-errors'

import type { ChatAttachment } from '@workspace/contracts'

import type {
  ChatInputDraftTarget,
  ChatInputImageAttachment,
} from '../state/chat-input-draft-store'

const IMAGE_ATTACHMENT_ID_PREFIX = 'image'

export function imageFilesFromTransfer(dataTransfer: DataTransfer | null) {
  if (!dataTransfer) return []

  return imageFilesFromFileList(dataTransfer.files)
}

export function imageFilesFromClipboard(clipboardData: DataTransfer | null) {
  if (!clipboardData) return []

  return imageFilesFromFileList(clipboardData.files)
}

async function createChatInputImageAttachments(files: readonly File[]) {
  const attachments: ChatInputImageAttachment[] = []

  for (const file of files) {
    const attachment = await chatInputImageAttachmentFromFile(file)
    attachments.push(attachment)
  }

  return attachments
}

export function chatInputAttachmentMetadata(
  attachments: readonly ChatInputImageAttachment[],
): ChatAttachment[] {
  return attachments.map(({ dataUrl: _dataUrl, previewUrl: _previewUrl, ...attachment }) => ({
    ...attachment,
  }))
}

export async function stageChatInputImageFiles({
  addImages,
  draftTarget,
  files,
  onError,
}: {
  addImages: (target: ChatInputDraftTarget, images: ChatInputImageAttachment[]) => void
  draftTarget: ChatInputDraftTarget
  files: readonly File[]
  onError: (error: string | null) => void
}) {
  try {
    const attachments = await createChatInputImageAttachments(files)
    if (attachments.length === 0) return

    addImages(draftTarget, attachments)
    onError(null)
  } catch {
    onError('Image attachment could not be read.')
  }
}

function imageFilesFromFileList(fileList: FileList) {
  return Array.from(fileList).filter(isImageFile)
}

async function chatInputImageAttachmentFromFile(file: File): Promise<ChatInputImageAttachment> {
  const dataUrl = await readFileAsDataUrl(file)

  return {
    dataUrl,
    id: `${IMAGE_ATTACHMENT_ID_PREFIX}-${crypto.randomUUID()}`,
    mimeType: file.type,
    name: file.name || 'image',
    previewUrl: dataUrl,
    sizeBytes: file.size,
    type: 'image',
  }
}

function isImageFile(file: File) {
  return file.type.toLowerCase().startsWith('image/')
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(createClientInvariantError('Image attachment did not produce a data URL.'))
    })
    reader.addEventListener('error', () => {
      reject(reader.error ?? createClientInvariantError('Image attachment could not be read.'))
    })
    reader.readAsDataURL(file)
  })
}
