import type { LexicalEditor } from 'lexical'
import { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot } from 'lexical'

export type ChatComposerSubmitOptions = {
  busy: boolean
  disabled: boolean
  editor: LexicalEditor
  onAfterSubmit: () => void
  onSubmitText: (text: string) => Promise<boolean>
  submitting: boolean
}

export function $setChatComposerText(text: string) {
  const root = $getRoot()
  root.clear()

  const paragraph = $createParagraphNode()
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    if (line.length > 0) paragraph.append($createTextNode(line))
    if (index < lines.length - 1) paragraph.append($createLineBreakNode())
  }
  root.append(paragraph)
}

export function clearChatComposerEditor(editor: LexicalEditor) {
  editor.update(() => {
    $setChatComposerText('')
  })
}

export function readChatComposerText(editor: LexicalEditor) {
  let text = ''
  editor.getEditorState().read(() => {
    text = $getRoot().getTextContent()
  })

  return text
}

export async function submitChatComposerEditor({
  busy,
  disabled,
  editor,
  onAfterSubmit,
  onSubmitText,
  submitting,
}: ChatComposerSubmitOptions) {
  if (disabled || busy || submitting) return false

  const text = readChatComposerText(editor).trim()
  if (!text) return false

  const sent = await onSubmitText(text)
  if (!sent) return false

  clearChatComposerEditor(editor)
  onAfterSubmit()

  return true
}
