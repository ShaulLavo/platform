import type { ChatAttachment } from '@workspace/contracts'
import { cn } from '@workspace/ui/lib/utils'
import { useState } from 'react'

import { chatAttachmentImages, unrenderableChatAttachments } from '../utils/attachment-image'
import { ChatImageLightbox } from './chat-image-lightbox'

/**
 * What the user actually sent, in the transcript. A file-name chip proved that
 * an image was attached without ever showing which one; the thumbnail is the
 * only form that survives scrolling back through a long thread.
 */
export function ChatAttachmentThumbnails({
  attachments,
  className,
}: {
  attachments: readonly ChatAttachment[]
  className?: string
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  if (attachments.length === 0) return null

  const images = chatAttachmentImages(attachments)
  const unrenderable = unrenderableChatAttachments(attachments)

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} data-chat-attachments='true'>
      {images.map((image, index) => (
        <button
          aria-label={`Open ${image.name}`}
          className='border-border/70 hover:border-border focus-visible:ring-ring size-16 shrink-0 overflow-hidden rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none'
          data-scroll-anchor-ignore
          key={image.id}
          title={image.name}
          type='button'
          onClick={() => setOpenIndex(index)}
        >
          <img
            alt=''
            className='size-full object-cover'
            crossOrigin='anonymous'
            draggable={false}
            src={image.src}
          />
        </button>
      ))}
      {unrenderable.map((attachment) => (
        <span
          className='border-border text-muted-foreground rounded border px-1.5 py-0.5 text-[10px]'
          key={attachment.id}
          title='This image type was not stored, so it cannot be shown.'
        >
          {attachment.name}
        </span>
      ))}
      <ChatImageLightbox images={images} openIndex={openIndex} onOpenIndexChange={setOpenIndex} />
    </div>
  )
}
