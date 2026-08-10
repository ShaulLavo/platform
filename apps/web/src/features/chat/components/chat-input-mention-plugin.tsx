import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  type NodeSelection,
  type PointType,
} from 'lexical'
import { useEffect } from 'react'

import { $isChatInputMentionNode, type ChatInputMentionNode } from './chat-input-mention-node'

/**
 * A chip reads as one word, so it deletes as one. Plain-text Lexical only
 * deletes through a range selection, which leaves both mention cases dead: a
 * caret behind a chip walks into the decorator instead of removing it, and a
 * chip the user selected outright ignores the key entirely.
 */
export function ChatInputMentionPlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      editor.registerCommand(KEY_BACKSPACE_COMMAND, $deleteChatInputMention, COMMAND_PRIORITY_LOW),
    [editor],
  )

  return null
}

function $deleteChatInputMention(event: KeyboardEvent | null) {
  const selection = $getSelection()
  if ($isNodeSelection(selection)) return $removeSelectedChatInputMentions(selection, event)
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false

  const mention = $chatInputMentionBefore(selection.anchor)
  if (!mention) return false

  event?.preventDefault()
  mention.remove()

  return true
}

function $removeSelectedChatInputMentions(
  selection: NodeSelection,
  event: KeyboardEvent | null,
): boolean {
  const mentions: ChatInputMentionNode[] = []
  for (const node of selection.getNodes()) {
    if ($isChatInputMentionNode(node)) mentions.push(node)
  }
  if (mentions.length === 0) return false

  event?.preventDefault()
  for (const mention of mentions) {
    mention.remove()
  }

  return true
}

function $chatInputMentionBefore(point: PointType) {
  const node = point.getNode()
  if (point.type === 'element') {
    const child = $isElementNode(node) ? node.getChildAtIndex(point.offset - 1) : null

    return $isChatInputMentionNode(child) ? child : null
  }
  // Anywhere else inside a text node there are real characters to delete first.
  if (point.offset > 0) return null

  const previous = node.getPreviousSibling()

  return $isChatInputMentionNode(previous) ? previous : null
}
