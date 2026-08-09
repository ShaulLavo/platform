import { Button } from '@workspace/ui/components/button'
import { cn } from '@workspace/ui/lib/utils'
import { useState } from 'react'

import { shouldCollapseUserMessage } from '../lib/user-message-collapse'
import { AssistantMarkdown } from './assistant-markdown'

/**
 * User messages are markdown too — code fences, lists and file links all come
 * from the composer, and a pasted wall of text stays clipped until asked for.
 */
export function UserMessageBody({ text }: { readonly text: string }) {
  const [expanded, setExpanded] = useState(false)
  const collapsible = shouldCollapseUserMessage(text)
  const collapsed = collapsible && !expanded

  return (
    <div className='min-w-0'>
      <div
        className={cn(
          'relative',
          collapsed &&
            'max-h-44 overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-1.75rem),transparent)]',
        )}
        data-user-message-body='true'
        data-user-message-collapsed={collapsed ? 'true' : 'false'}
        data-user-message-collapsible={collapsible ? 'true' : 'false'}
      >
        <AssistantMarkdown text={text} />
      </div>
      {collapsible ? (
        <Button
          aria-expanded={expanded}
          className='text-muted-foreground hover:text-foreground mt-1 -ml-1.5'
          data-scroll-anchor-ignore
          size='xs'
          type='button'
          variant='ghost'
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : 'Show full message'}
        </Button>
      ) : null}
    </div>
  )
}
