import { describe, expect, it } from 'bun:test'

import {
  chatInputMentionCommandItems,
  detectChatInputTrigger,
  replaceChatInputTextRange,
  searchChatInputSlashCommands,
} from './chat-input-logic'

describe('chat input logic', () => {
  it('detects slash commands at the start of the current line', () => {
    expect(detectChatInputTrigger('/pl', 3)).toEqual({
      kind: 'slash-command',
      query: 'pl',
      rangeEnd: 3,
      rangeStart: 0,
    })
    expect(detectChatInputTrigger('hello\n/de', 9)).toEqual({
      kind: 'slash-command',
      query: 'de',
      rangeEnd: 9,
      rangeStart: 6,
    })
  })

  it('detects mentions in the current token only', () => {
    expect(detectChatInputTrigger('open @src/app', 13)).toEqual({
      kind: 'mention',
      query: 'src/app',
      rangeEnd: 13,
      rangeStart: 5,
    })
    expect(detectChatInputTrigger('email user@example.com', 18)).toBeNull()
  })

  it('replaces a trigger range with stable mention text', () => {
    expect(
      replaceChatInputTextRange({
        rangeEnd: 8,
        rangeStart: 5,
        replacement: '@src/app.ts ',
        text: 'read @ap now',
      }),
    ).toEqual({
      cursor: 17,
      text: 'read @src/app.ts  now',
    })
  })

  it('filters slash commands by query', () => {
    expect(searchChatInputSlashCommands('pla').map((item) => item.value)).toEqual(['plan'])
  })

  it('keeps entry types for mention icons', () => {
    expect(
      chatInputMentionCommandItems([
        { id: 'path:src', label: 'src', path: 'src', type: 'directory' },
        { id: 'path:app.tsx', label: 'app.tsx', path: 'src/app.tsx', type: 'file' },
      ]),
    ).toMatchObject([
      { entryType: 'directory', type: 'mention' },
      { entryType: 'file', type: 'mention' },
    ])
  })
})
