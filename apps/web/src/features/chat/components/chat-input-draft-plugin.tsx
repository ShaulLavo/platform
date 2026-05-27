import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { $getRoot, type EditorState, type LexicalEditor } from 'lexical'
import { useCallback, useEffect, type RefObject } from 'react'

import { writeChatDraft } from '../lib/chat-draft-storage'

export function ChatInputDraftPlugin({
  busy,
  disabled,
  draftKey,
  onEditorReady,
  rootPath,
  sendButtonRef,
  submitting,
}: {
  busy: boolean
  disabled: boolean
  draftKey: string
  onEditorReady: (editor: LexicalEditor | null) => void
  rootPath: string
  sendButtonRef: RefObject<HTMLButtonElement | null>
  submitting: boolean
}) {
  const [editor] = useLexicalComposerContext()
  const updateSendButton = useCallback(
    (text: string) => {
      updateSendButtonDisabled(sendButtonRef.current, {
        busy,
        disabled,
        submitting,
        text,
      })
    },
    [busy, disabled, sendButtonRef, submitting],
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
        const text = $getRoot().getTextContent()
        writeChatDraft(rootPath, draftKey, text)
        updateSendButton(text)
      })
    },
    [draftKey, rootPath, updateSendButton],
  )

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
}

function readCurrentEditorText(editor: LexicalEditor) {
  let text = ''
  editor.getEditorState().read(() => {
    text = $getRoot().getTextContent()
  })

  return text
}

function updateSendButtonDisabled(
  button: HTMLButtonElement | null,
  {
    busy,
    disabled,
    submitting,
    text,
  }: {
    busy: boolean
    disabled: boolean
    submitting: boolean
    text: string
  },
) {
  if (!button) return

  button.disabled = busy ? disabled : disabled || submitting || !text.trim()
}
