import { markdownToPlainText } from '@/features/chat/utils/message-text'
import { expect, test } from '../../../../../test/fixtures'

test('drops heading markers but keeps the heading text', () => {
  expect(markdownToPlainText('## Results\n\nAll green.')).toBe('Results\n\nAll green.')
})

test('unwraps emphasis, strikethrough, and inline code', () => {
  expect(markdownToPlainText('**bold** and *thin* and ~~gone~~ and `code`')).toBe(
    'bold and thin and gone and code',
  )
})

test('keeps link and image text without the target', () => {
  expect(
    markdownToPlainText('See [the docs](https://example.com) and ![a chart](chart.png).'),
  ).toBe('See the docs and a chart.')
})

test('keeps fenced code verbatim and drops only the fences', () => {
  const markdown = ['Run this:', '', '```ts', 'const a = **1**', '```'].join('\n')

  expect(markdownToPlainText(markdown)).toBe('Run this:\n\nconst a = **1**')
})

test('a longer closing fence still closes the block', () => {
  expect(markdownToPlainText('```\nraw\n````\nafter')).toBe('raw\nafter')
})

test('a fence of the other character does not close the block', () => {
  expect(markdownToPlainText('```\n~~~\nstill code\n```')).toBe('~~~\nstill code')
})

test('markers inside an inline code span survive', () => {
  expect(markdownToPlainText('use `**kwargs` here')).toBe('use **kwargs here')
})

test('snake_case identifiers are not read as emphasis', () => {
  expect(markdownToPlainText('call some_long_name(x)')).toBe('call some_long_name(x)')
})

test('drops blockquote markers and thematic breaks', () => {
  expect(markdownToPlainText('> quoted line\n\n---\n\nafter')).toBe('quoted line\n\nafter')
})

test('keeps list markers, which read fine as plain text', () => {
  expect(markdownToPlainText('- **one**\n- two')).toBe('- one\n- two')
})

test('leaves a table alone rather than mangling it', () => {
  const table = '| a | b |\n| --- | --- |\n| 1 | 2 |'

  expect(markdownToPlainText(table)).toBe(table)
})

test('plain text passes through unchanged', () => {
  expect(markdownToPlainText('just a sentence')).toBe('just a sentence')
})
