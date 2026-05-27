import { XIcon } from '@phosphor-icons/react'
import { Button } from '@workspace/ui/components/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui/components/tooltip'

import type { ChatInputImageAttachment } from '../state/chat-input-draft-store'

export function ChatInputAttachmentList({
  attachments,
  disabled,
  onRemove,
}: {
  attachments: readonly ChatInputImageAttachment[]
  disabled: boolean
  onRemove: (attachmentId: string) => void
}) {
  if (attachments.length === 0) return null

  return (
    <div className='flex min-w-0 gap-2 overflow-x-auto px-3 pb-2'>
      {attachments.map((attachment) => (
        <div
          className='border-border/70 bg-muted/35 flex max-w-48 shrink-0 items-center gap-2 rounded-md border p-1 pr-1.5'
          key={attachment.id}
        >
          <img
            alt=''
            className='size-9 rounded object-cover'
            draggable={false}
            src={attachment.previewUrl}
          />
          <span className='min-w-0 flex-1 text-xs'>
            <span className='block truncate font-medium'>{attachment.name}</span>
            <span className='text-muted-foreground block'>{formatAttachmentSize(attachment)}</span>
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={`Remove ${attachment.name}`}
                  className='text-muted-foreground hover:text-foreground rounded-md'
                  disabled={disabled}
                  size='icon-xs'
                  title='Remove attachment'
                  type='button'
                  variant='ghost'
                  onClick={() => onRemove(attachment.id)}
                />
              }
            >
              <XIcon className='size-3.5' />
            </TooltipTrigger>
            <TooltipContent>Remove attachment</TooltipContent>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}

function formatAttachmentSize(attachment: ChatInputImageAttachment) {
  if (attachment.sizeBytes < 1024) return `${attachment.sizeBytes} B`
  if (attachment.sizeBytes < 1024 * 1024) return `${Math.round(attachment.sizeBytes / 1024)} KB`

  return `${(attachment.sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
