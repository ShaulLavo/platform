import { describe, expect, it } from 'vitest'

import {
  activeComposerMention,
  collectComposerMentions,
  parseComposerMention,
  serializeComposerMention,
  splitComposerPrompt,
} from '../composer-tokens'

describe('composer mention grammar', () => {
  it('round-trips every path a workspace can produce, spaces included', () => {
    const paths = [
      'src/app.ts',
      'src/my file.ts',
      'docs/a b/c d.md',
      'weird/"quoted".ts',
      'weird/back\\slash.ts',
      'weird/line\nbreak.ts',
      'trailing space ',
      '@literal-at.ts',
    ]

    for (const path of paths) {
      expect(parseComposerMention(serializeComposerMention(path))).toBe(path)
    }
  })

  it('quotes only the paths that need it', () => {
    expect(serializeComposerMention('src/app.ts')).toBe('@src/app.ts')
    expect(serializeComposerMention('src/my file.ts')).toBe('@"src/my file.ts"')
    expect(serializeComposerMention('a"b\\c')).toBe('@"a\\"b\\\\c"')
  })

  it('finds a spaced mention inside a sentence without swallowing the prose', () => {
    expect(collectComposerMentions('read @"src/my file.ts" now')).toEqual([
      { end: 22, path: 'src/my file.ts', source: '@"src/my file.ts"', start: 5 },
    ])
  })

  it('leaves email addresses and mid-word at-signs alone', () => {
    expect(collectComposerMentions('email user@example.com now')).toEqual([])
  })

  it('refuses an unterminated quote rather than eating the rest of the prompt', () => {
    expect(collectComposerMentions('read @"src/my file now')).toEqual([])
    expect(collectComposerMentions('read @"src/my\nfile.ts" now')).toEqual([])
  })

  it('splits a prompt into the prose and mentions a chip renderer walks', () => {
    expect(splitComposerPrompt('read @"a b.ts" and @c.ts')).toEqual([
      { text: 'read ', type: 'text' },
      { path: 'a b.ts', source: '@"a b.ts"', type: 'mention' },
      { text: ' and ', type: 'text' },
      { path: 'c.ts', source: '@c.ts', type: 'mention' },
    ])
  })

  it('keeps a quoted mention triggered across the spaces inside it', () => {
    expect(activeComposerMention('read @"src/my fi', 16)).toEqual({
      query: 'src/my fi',
      start: 5,
    })
    expect(activeComposerMention('read @src/ap', 12)).toEqual({ query: 'src/ap', start: 5 })
    expect(activeComposerMention('read @', 6)).toEqual({ query: '', start: 5 })
  })

  it('drops the trigger once the mention is finished or was never one', () => {
    expect(activeComposerMention('read @"src/my file.ts"', 22)).toBeNull()
    expect(activeComposerMention('read @a b', 9)).toBeNull()
    expect(activeComposerMention('email user@example.com', 22)).toBeNull()
    expect(activeComposerMention('read @a\nnow', 11)).toBeNull()
  })
})
