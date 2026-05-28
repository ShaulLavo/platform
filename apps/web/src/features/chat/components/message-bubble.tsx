import type { OrchestrationMessage } from '@workspace/contracts'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { cjk } from '@streamdown/cjk'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { cn } from '@workspace/ui/lib/utils'
import { useMemo } from 'react'
import { Streamdown } from 'streamdown'

import { normalizeAgentMarkdown } from '../lib/agent-markdown'
import { formatChatTimestamp } from '../lib/chat-formatters'
import {
  createStreamdownEditorCodePlugin,
  streamdownThemesForEditorTheme,
} from '../lib/streamdown-editor-theme'
import type { OptimisticChatMessage } from '../state/chat-optimistic-store'

const baseStreamdownPlugins = { cjk, math, mermaid }

export function MessageBubble({
  message,
}: {
  message: OrchestrationMessage | OptimisticChatMessage
}) {
  const { colorMode, editorTheme } = useEditorColorTheme()
  const streamdownThemes = useMemo(
    () => streamdownThemesForEditorTheme(editorTheme, colorMode),
    [colorMode, editorTheme],
  )
  const streamdownPlugins = useMemo(
    () => ({
      ...baseStreamdownPlugins,
      code: createStreamdownEditorCodePlugin(streamdownThemes, editorTheme),
    }),
    [editorTheme, streamdownThemes],
  )
  const user = message.role === 'user'
  const optimistic = 'optimistic' in message
  const attachments = message.attachments ?? []
  const renderedText = useMemo(
    () => (user ? message.text : normalizeAgentMarkdown(message.text)),
    [message.text, user],
  )

  return (
    <div
      className={cn(
        'flex w-full min-w-0',
        user ? 'justify-end' : 'justify-start',
        optimistic && 'opacity-70',
      )}
    >
      <article
        className={cn(
          'min-w-0 text-sm leading-5',
          user
            ? 'max-w-[88%] rounded-md border border-blue-500/30 bg-blue-600 px-3 py-2 text-white shadow-sm'
            : 'w-full max-w-full px-1 py-2 text-foreground',
        )}
      >
        {user ? (
          <div className='break-words whitespace-pre-wrap'>{message.text}</div>
        ) : (
          <Streamdown
            className='max-w-full min-w-0 break-words [&_[data-streamdown=code-block-body]]:!border-0 [&_[data-streamdown=code-block]]:max-w-full [&_[data-streamdown=code-block]]:!border-0 [&_[data-streamdown=code-block]]:!bg-transparent [&>*:first-child]:mt-0 [&>*:last-child]:mb-0'
            plugins={streamdownPlugins}
            shikiTheme={streamdownThemes}
          >
            {renderedText}
          </Streamdown>
        )}
        {attachments.length > 0 ? (
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {attachments.map((attachment) => (
              <span
                className={cn(
                  'rounded border px-1.5 py-0.5 text-[10px]',
                  user ? 'border-white/25 text-white/80' : 'border-border text-muted-foreground',
                )}
                key={attachment.id}
              >
                {attachment.name}
              </span>
            ))}
          </div>
        ) : null}
        <div
          className={cn(
            'mt-1 text-[10px] tabular-nums',
            user ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          {optimistic ? 'Sending' : formatChatTimestamp(message.updatedAt)}
        </div>
      </article>
    </div>
  )
}
