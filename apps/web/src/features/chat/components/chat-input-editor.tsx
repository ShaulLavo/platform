import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import type { LexicalEditor } from 'lexical'
import type { RefObject } from 'react'

import { ChatInputDraftPlugin } from './chat-input-draft-plugin'
import { ChatInputSubmitPlugin } from './chat-input-submit-plugin'

export function ChatInputEditor({
  busy,
  disabled,
  draftKey,
  onEditorReady,
  onSubmitRequest,
  placeholder,
  rootPath,
  sendButtonRef,
  submitting,
}: {
  busy: boolean
  disabled: boolean
  draftKey: string
  onEditorReady: (editor: LexicalEditor | null) => void
  onSubmitRequest: () => Promise<boolean>
  placeholder: string
  rootPath: string
  sendButtonRef: RefObject<HTMLButtonElement | null>
  submitting: boolean
}) {
  return (
    <div className='relative px-4 pt-4 pb-2'>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            aria-label='Message'
            aria-placeholder={placeholder}
            className='app-scrollbar-thin text-foreground block max-h-48 min-h-20 w-full overflow-y-auto bg-transparent text-sm leading-6 break-words whitespace-pre-wrap outline-none'
            data-testid='chat-input-editor'
            placeholder={<span />}
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
        placeholder={
          <div className='text-muted-foreground/65 pointer-events-none absolute top-4 right-4 left-4 text-sm leading-6'>
            {placeholder}
          </div>
        }
      />
      <ChatInputDraftPlugin
        busy={busy}
        disabled={disabled}
        draftKey={draftKey}
        rootPath={rootPath}
        sendButtonRef={sendButtonRef}
        submitting={submitting}
        onEditorReady={onEditorReady}
      />
      <ChatInputSubmitPlugin disabled={disabled} onSubmitRequest={onSubmitRequest} />
      <HistoryPlugin />
    </div>
  )
}
