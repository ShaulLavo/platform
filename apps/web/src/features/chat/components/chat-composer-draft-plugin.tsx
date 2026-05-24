import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { $getRoot, type EditorState } from 'lexical'
import { useCallback, useEffect } from 'react'

export function ChatComposerDraftPlugin({
  disabled,
  onDraftChange,
}: {
  disabled: boolean
  onDraftChange: (draft: string) => void
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    editor.setEditable(!disabled)
  }, [disabled, editor])

  const handleChange = useCallback(
    (editorState: EditorState) => {
      editorState.read(() => {
        onDraftChange($getRoot().getTextContent())
      })
    },
    [onDraftChange],
  )

  return <OnChangePlugin onChange={handleChange} />
}
