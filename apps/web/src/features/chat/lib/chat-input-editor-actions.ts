import type { LexicalEditor } from 'lexical'
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
} from 'lexical'

import { replaceChatInputTextRange } from './chat-input-logic'

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
  paragraph.selectEnd()
}

export function clearChatInputEditor(editor: LexicalEditor) {
  editor.update(() => {
    $setChatInputText('')
  })
}

export function readChatInputText(editor: LexicalEditor) {
  let text = ''
  editor.getEditorState().read(() => {
    text = $readChatInputTextSnapshot().text
  })

  return text
}

export function replaceChatInputEditorTextRange(
  editor: LexicalEditor,
  {
    rangeEnd,
    rangeStart,
    replacement,
  }: {
    rangeEnd: number
    rangeStart: number
    replacement: string
  },
) {
  let nextText = ''

  editor.update(() => {
    const result = replaceChatInputTextRange({
      rangeEnd,
      rangeStart,
      replacement,
      text: $getRoot().getTextContent(),
    })
    nextText = result.text
    $setChatInputText(result.text)
  })

  return nextText
}

export function $readChatInputTextSnapshot() {
  const text = $getRoot().getTextContent()
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return { cursor: text.length, text }
  if (!selection.isCollapsed()) return { cursor: text.length, text }

  return {
    cursor: textOffsetForLexicalPoint(selection.anchor, text.length),
    text,
  }
}

function textOffsetForLexicalPoint(
  point: { getNode: () => LexicalNode; offset: number },
  fallback: number,
) {
  const anchorNode = point.getNode()
  const root = $getRoot()
  const result = textOffsetInNode(root, anchorNode, point.offset, 0)

  return result.found ? result.offset : fallback
}

function textOffsetInNode(
  node: LexicalNode,
  anchorNode: LexicalNode,
  anchorOffset: number,
  offset: number,
): { found: boolean; offset: number } {
  if (node.getKey() === anchorNode.getKey()) {
    return {
      found: true,
      offset: offset + anchorOffsetInNode(node, anchorOffset),
    }
  }
  if (!$isElementNode(node)) return { found: false, offset: offset + lexicalNodeTextSize(node) }

  return textOffsetInChildren(node.getChildren(), anchorNode, anchorOffset, offset)
}

function textOffsetInChildren(
  children: LexicalNode[],
  anchorNode: LexicalNode,
  anchorOffset: number,
  offset: number,
) {
  let nextOffset = offset

  for (const child of children) {
    const result = textOffsetInNode(child, anchorNode, anchorOffset, nextOffset)
    if (result.found) return result

    nextOffset = result.offset
  }

  return { found: false, offset: nextOffset }
}

function anchorOffsetInNode(node: LexicalNode, anchorOffset: number) {
  if ($isElementNode(node)) return elementTextSizeBeforeOffset(node.getChildren(), anchorOffset)

  return anchorOffset
}

function elementTextSizeBeforeOffset(children: LexicalNode[], anchorOffset: number) {
  let size = 0
  const end = Math.max(0, Math.min(children.length, anchorOffset))

  for (let index = 0; index < end; index += 1) {
    const child = children[index]
    if (child) size += lexicalNodeTextSize(child)
  }

  return size
}

function lexicalNodeTextSize(node: LexicalNode): number {
  if ($isTextNode(node)) return node.getTextContentSize()
  if ($isLineBreakNode(node)) return 1
  if (!$isElementNode(node)) return 0

  return node.getChildren().reduce((size, child) => size + lexicalNodeTextSize(child), 0)
}
