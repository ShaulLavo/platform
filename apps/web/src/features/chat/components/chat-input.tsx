import { LexicalComposer, type InitialConfigType } from '@lexical/react/LexicalComposer'
import type { LexicalEditor } from 'lexical'
import { useCallback, useMemo, useRef, useState } from 'react'

import {
  $setChatInputText,
  clearChatInputEditor,
  readChatInputText,
} from '../lib/chat-input-editor-actions'
import { clearChatDraft, readChatDraft } from '../lib/chat-draft-storage'
import { ChatInputActions } from './chat-input-actions'
import { ChatInputEditor } from './chat-input-editor'

export function ChatInput({
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
  const inputKey = `${rootPath}:${draftKey}`
  const editorRef = useRef<LexicalEditor | null>(null)
  const submitButtonRef = useRef<HTMLButtonElement | null>(null)
  const initialDraft = useMemo(
    () => readChatDraft(rootPath, draftKey),
    [inputKey, draftKey, rootPath],
  )
  const [submitting, setSubmitting] = useState(false)
  const sendDisabled = disabled || submitting || !initialDraft.trim()
  const statusLabel = error ?? (busy ? 'Working' : null)
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      editorState: () => {
        $setChatInputText(initialDraft)
      },
      namespace: `platform-chat-input:${inputKey}`,
      onError: (error) => {
        throw error
      },
    }),
    [inputKey, initialDraft],
  )

  const handleEditorReady = useCallback((editor: LexicalEditor | null) => {
    editorRef.current = editor
  }, [])
  const clearDraft = useCallback(() => {
    const editor = editorRef.current
    if (editor) clearChatInputEditor(editor)

    clearChatDraft(rootPath, draftKey)
    if (submitButtonRef.current) submitButtonRef.current.disabled = true
  }, [draftKey, rootPath])

  const handleSubmit = useCallback(async () => {
    if (busy || disabled || submitting) return false

    const editor = editorRef.current
    const text = editor ? readChatInputText(editor).trim() : ''
    if (!text) return false

    setSubmitting(true)
    try {
      const sent = await onSubmit(text)
      if (sent) clearDraft()

      return sent
    } finally {
      setSubmitting(false)
    }
  }, [busy, clearDraft, disabled, onSubmit, submitting])

  return (
    <div className='shrink-0 px-3 pt-2 pb-3'>
      <form className='mx-auto w-full max-w-3xl' onSubmit={(event) => event.preventDefault()}>
        <LexicalComposer initialConfig={initialConfig} key={inputKey}>
          <div className='border-border/80 bg-background/90 overflow-hidden rounded-md border shadow-[0_16px_42px_color-mix(in_oklch,var(--foreground)_7%,transparent)] backdrop-blur transition-[border-color,box-shadow] focus-within:border-blue-500/70 focus-within:ring-2 focus-within:ring-blue-500/20'>
            <ChatInputEditor
              busy={busy}
              disabled={disabled || submitting}
              draftKey={draftKey}
              placeholder='Ask anything. Use @ to mention, / for commands, or add context.'
              rootPath={rootPath}
              sendButtonRef={submitButtonRef}
              submitting={submitting}
              onEditorReady={handleEditorReady}
              onSubmitRequest={handleSubmit}
            />
            <ChatInputActions
              busy={busy}
              disabled={disabled}
              modelLabel={modelLabel}
              sendButtonRef={submitButtonRef}
              sendDisabled={sendDisabled}
              statusLabel={statusLabel}
              onStop={onStop}
              onSubmit={handleSubmit}
            />
          </div>
        </LexicalComposer>
      </form>
    </div>
  )
}
