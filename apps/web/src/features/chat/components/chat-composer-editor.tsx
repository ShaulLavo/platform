import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'

import { ChatComposerDraftPlugin } from './chat-composer-draft-plugin'
import { ChatComposerSubmitPlugin } from './chat-composer-submit-plugin'

export function ChatComposerEditor({
  busy,
  disabled,
  onAfterSubmit,
  onDraftChange,
  onSubmitText,
  placeholder,
  submitting,
}: {
  busy: boolean
  disabled: boolean
  onAfterSubmit: () => void
  onDraftChange: (draft: string) => void
  onSubmitText: (text: string) => Promise<boolean>
  placeholder: string
  submitting: boolean
}) {
  const editorDisabled = disabled || submitting

  return (
    <div className='relative px-3 pt-3 pb-2.5'>
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            aria-label='Message'
            aria-placeholder={placeholder}
            className='app-scrollbar-thin text-foreground block max-h-40 min-h-20 w-full overflow-y-auto bg-transparent text-sm leading-6 break-words whitespace-pre-wrap outline-none'
            data-testid='chat-composer-editor'
            placeholder={<span />}
          />
        }
        ErrorBoundary={LexicalErrorBoundary}
        placeholder={
          <div className='text-muted-foreground/65 pointer-events-none absolute top-3 right-3 left-3 text-sm leading-6'>
            {placeholder}
          </div>
        }
      />
      <ChatComposerDraftPlugin disabled={editorDisabled} onDraftChange={onDraftChange} />
      <ChatComposerSubmitPlugin
        busy={busy}
        disabled={editorDisabled}
        submitting={submitting}
        onAfterSubmit={onAfterSubmit}
        onSubmitText={onSubmitText}
      />
      <HistoryPlugin />
    </div>
  )
}
