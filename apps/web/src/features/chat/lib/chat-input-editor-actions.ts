import type { LexicalEditor } from 'lexical'
import { $createLineBreakNode, $createParagraphNode, $createTextNode, $getRoot } from 'lexical'

export function $setChatInputText(text: string) {
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

export function clearChatInputEditor(editor: LexicalEditor) {
  editor.update(() => {
    $setChatInputText('')
  })
}

export function readChatInputText(editor: LexicalEditor) {
  let text = ''
  editor.getEditorState().read(() => {
    text = $getRoot().getTextContent()
  })

  return text
}
