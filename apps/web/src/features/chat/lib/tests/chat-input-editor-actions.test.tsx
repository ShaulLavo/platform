import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { $getSelection, KEY_DOWN_COMMAND, type LexicalEditor } from 'lexical'
import { useEffect } from 'react'

import { ChatInputLineBoundaryPlugin } from '@/features/chat/components/chat-input-line-boundary-plugin'
import {
  $readChatInputTextSnapshot,
  $setChatInputText,
  moveChatInputCaretToLineBoundary,
  replaceChatInputEditorRange,
  surroundChatInputSelection,
} from '@/features/chat/lib/chat-input-editor-actions'
import { expect, test } from '../../../../../test/fixtures'
import { renderWithProviders } from '../../../../../test/render'

test('a mention committed mid-sentence leaves the caret right after the inserted text', () => {
  const editor = mountChatInputEditor('read @ap now')

  const applied = replaceChatInputEditorRange(editor, {
    expectedText: '@ap',
    rangeEnd: 8,
    rangeStart: 5,
    replacement: '@src/app.ts ',
  })

  expect(applied?.text).toBe('read @src/app.ts now')
  expect(snapshot(editor)).toEqual({ cursor: 17, text: 'read @src/app.ts now' })
})

test('the replacement eats the space the prompt already had, so no double space lands', () => {
  const editor = mountChatInputEditor('read @ap now')

  replaceChatInputEditorRange(editor, {
    rangeEnd: 8,
    rangeStart: 5,
    replacement: '@src/app.ts ',
  })

  expect(snapshot(editor).text).toBe('read @src/app.ts now')
})

test('a second commit against the now-stale range is refused', () => {
  const editor = mountChatInputEditor('read @ap now')
  const range = { expectedText: '@ap', rangeEnd: 8, rangeStart: 5, replacement: '@src/app.ts ' }

  replaceChatInputEditorRange(editor, range)
  const second = replaceChatInputEditorRange(editor, range)

  expect(second).toBeNull()
  expect(snapshot(editor).text).toBe('read @src/app.ts now')
})

test('Home and End move the caret to the bounds of the current line', () => {
  const editor = mountChatInputEditor('first line\nsecond line')

  pressKey(editor, 'Home')
  expect(snapshot(editor).cursor).toBe(11)

  pressKey(editor, 'End')
  expect(snapshot(editor).cursor).toBe(22)
})

test('shift extends the selection to the line boundary instead of moving the caret', () => {
  const editor = mountChatInputEditor('first line\nsecond line')

  pressKey(editor, 'Home', { shiftKey: true })

  expect(selectedText(editor)).toBe('second line')
})

test('Home at the start of the line is left to the browser', () => {
  const editor = mountChatInputEditor('only line')

  moveChatInputCaretToLineBoundary(editor, 'start', false)

  expect(moveChatInputCaretToLineBoundary(editor, 'start', false)).toBe(false)
})

test('typing a bracket over a selection wraps it and keeps the wrapped text selected', () => {
  const editor = mountChatInputEditor('wrap this word')

  moveChatInputCaretToLineBoundary(editor, 'start', false)
  moveChatInputCaretToLineBoundary(editor, 'end', true)

  expect(surroundChatInputSelection(editor, '(', ')')).toBe(true)
  expect(snapshot(editor).text).toBe('(wrap this word)')
  expect(selectedText(editor)).toBe('wrap this word')
})

function mountChatInputEditor(text: string) {
  const state = { editor: null as LexicalEditor | null }

  renderWithProviders(
    <LexicalComposer
      initialConfig={{
        editorState: () => {
          $setChatInputText(text)
        },
        namespace: 'chat-input-editor-actions-test',
        onError: (error) => {
          throw error
        },
      }}
    >
      <PlainTextPlugin
        contentEditable={<ContentEditable />}
        ErrorBoundary={LexicalErrorBoundary}
        placeholder={null}
      />
      <ChatInputLineBoundaryPlugin />
      <CaptureEditor
        onReady={(editor) => {
          state.editor = editor
        }}
      />
    </LexicalComposer>,
  )

  const editor = state.editor
  if (!editor) throw new Error('chat input editor never mounted')

  return editor
}

function CaptureEditor({ onReady }: { readonly onReady: (editor: LexicalEditor) => void }) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    onReady(editor)
  }, [editor, onReady])

  return null
}

function pressKey(editor: LexicalEditor, key: string, init: KeyboardEventInit = {}) {
  editor.dispatchCommand(
    KEY_DOWN_COMMAND,
    new KeyboardEvent('keydown', { cancelable: true, key, ...init }),
  )
}

// `editor.read` flushes the pending update first; `getEditorState()` would still
// be showing the state from before the action under test.
function snapshot(editor: LexicalEditor) {
  return editor.read(() => $readChatInputTextSnapshot())
}

function selectedText(editor: LexicalEditor) {
  return editor.read(() => $getSelection()?.getTextContent() ?? '')
}
