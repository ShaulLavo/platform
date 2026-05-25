import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import { WrenchIcon } from '@phosphor-icons/react'
import { useCallback, useMemo, useState } from 'react'

import { useChatComposerDraft } from '../hooks/use-chat-composer-draft'
import { $setChatComposerText } from '../lib/chat-composer-editor-actions'
import { ChatComposerActions } from './chat-composer-actions'
import { ChatComposerEditor } from './chat-composer-editor'

export function ChatComposer({
  busy,
  disabled,
  draftKey,
  error,
  modelLabel,
  onStop,
  onSubmit,
  rootPath,
}: {
  busy: boolean
  disabled: boolean
  draftKey: string
  error: string | null
  modelLabel: string
  onStop: () => void
  onSubmit: (text: string) => Promise<boolean>
  rootPath: string
}) {
  const composerKey = `${rootPath}:${draftKey}`
  const { clearDraft, draft, setDraft } = useChatComposerDraft({ draftKey, rootPath })
  const [submitting, setSubmitting] = useState(false)
  const sendDisabled = disabled || submitting || !draft.trim()
  const statusLabel = error ?? (busy ? 'Working' : null)
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      editorState: () => {
        $setChatComposerText(draft)
      },
      namespace: `platform-chat-composer:${composerKey}`,
      onError: (error) => {
        throw error
      },
    }),
    [composerKey, draft],
  )

  const handleSubmitText = useCallback(
    async (text: string) => {
      if (disabled || submitting) return false

      setSubmitting(true)
      try {
        return await onSubmit(text)
      } finally {
        setSubmitting(false)
      }
    },
    [disabled, onSubmit, submitting],
  )

  return (
    <div className='shrink-0 p-3 pt-2'>
      <form className='mx-auto w-full max-w-2xl' onSubmit={(event) => event.preventDefault()}>
        <LexicalComposer initialConfig={initialConfig} key={composerKey}>
          <div className='border-border bg-muted/60 focus-within:border-ring/45 rounded-md border shadow-sm transition-colors'>
            <div className='flex items-center gap-2 px-3 pt-3 text-sm font-medium'>
              <span className='text-muted-foreground min-w-0 truncate'>
                @<span className='text-foreground'>Agent</span>
              </span>
              <WrenchIcon className='text-muted-foreground size-3.5 shrink-0' />
            </div>
            <div className='border-border bg-background/35 m-0.5 mt-3 overflow-hidden rounded-md border'>
              <ChatComposerEditor
                busy={busy}
                disabled={disabled}
                placeholder='Message the agent'
                submitting={submitting}
                onAfterSubmit={clearDraft}
                onDraftChange={setDraft}
                onSubmitText={handleSubmitText}
              />
              <ChatComposerActions
                busy={busy}
                disabled={disabled}
                modelLabel={modelLabel}
                sendDisabled={sendDisabled}
                statusLabel={statusLabel}
                submitting={submitting}
                onAfterSubmit={clearDraft}
                onStop={onStop}
                onSubmitText={handleSubmitText}
              />
            </div>
          </div>
        </LexicalComposer>
      </form>
    </div>
  )
}
