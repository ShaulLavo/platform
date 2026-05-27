import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import type { EditorState, LexicalEditor } from 'lexical'
import { useCallback, useEffect, type RefObject } from 'react'

import { detectChatInputTrigger, type ChatInputTrigger } from '../lib/chat-input-logic'
import { $readChatInputTextSnapshot } from '../lib/chat-input-editor-actions'
import { useChatInputDraftStore } from '../state/chat-input-draft-store'

export function ChatInputDraftPlugin({
  busy,
  disabled,
  draftKey,
  hasAttachments,
  onEditorReady,
  onTriggerChange,
  rootPath,
  sendButtonRef,
  submitting,
}: {
  busy: boolean
  disabled: boolean
  draftKey: string
  hasAttachments: boolean
  onEditorReady: (editor: LexicalEditor | null) => void
  onTriggerChange: (trigger: ChatInputTrigger | null) => void
  rootPath: string
  sendButtonRef: RefObject<HTMLButtonElement | null>
  submitting: boolean
}) {
  const [editor] = useLexicalComposerContext()
  const setPrompt = useChatInputDraftStore((store) => store.setPrompt)
  const updateSendButton = useCallback(
    (text: string) => {
      updateSendButtonDisabled(sendButtonRef.current, {
        busy,
        disabled,
        hasAttachments,
        submitting,
        text,
      })
    },
    [busy, disabled, hasAttachments, sendButtonRef, submitting],
  )

  useEffect(() => {
    onEditorReady(editor)
    return () => onEditorReady(null)
  }, [editor, onEditorReady])

  useEffect(() => {
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    updateSendButton(readCurrentEditorText(editor))
  }, [editor, updateSendButton])

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        const { cursor, text } = $readChatInputTextSnapshot()
        setPrompt({ draftKey, rootPath }, text)
        onTriggerChange(detectChatInputTrigger(text, cursor))
        updateSendButton(text)
      })
    },
    [draftKey, onTriggerChange, rootPath, setPrompt, updateSendButton],
  )

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
}

function readCurrentEditorText(editor: LexicalEditor) {
  let text = ''
  editor.getEditorState().read(() => {
    text = $readChatInputTextSnapshot().text
  })

  return text
}

function updateSendButtonDisabled(
  button: HTMLButtonElement | null,
  {
    busy,
    disabled,
    hasAttachments,
    submitting,
    text,
  }: {
    busy: boolean
    disabled: boolean
    hasAttachments: boolean
    submitting: boolean
    text: string
  },
) {
  if (!button) return

  button.disabled = busy ? disabled : disabled || submitting || (!hasAttachments && !text.trim())
}
