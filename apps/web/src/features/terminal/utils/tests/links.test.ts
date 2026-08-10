import {
  readTerminalPathLinks,
  type TerminalBufferLine,
  type TerminalBufferLineReader,
} from '@/features/terminal/utils/links'
import { expect, test } from '../../../../../test/fixtures'

const COLUMNS = 28
const ROOT = '/Users/dev/app'
/** What ghostty reports for a cell the shell never wrote to. */
const UNWRITTEN = '\u0000'

test('a stack-trace frame links the file, its line and its column', () => {
  const links = readTerminalPathLinks({
    getLine: buffer([row('  at run (src/index.ts:42:9)')]),
    rootPath: ROOT,
    row: 0,
  })

  expect(links).toEqual([
    {
      range: { end: { x: 26, y: 0 }, start: { x: 10, y: 0 } },
      reference: {
        column: 9,
        label: 'src/index.ts:42:9',
        line: 42,
        path: '/Users/dev/app/src/index.ts',
      },
      text: 'src/index.ts:42:9',
    },
  ])
})

test('a path the emulator soft-wrapped across two rows is still one link', () => {
  // The halves are `…/app/src` and `/index.ts:42:9)`; neither reads as a file on
  // its own, so a detector working one row at a time finds nothing here.
  const links = readTerminalPathLinks({
    getLine: buffer([
      row('  at run (/Users/dev/app/src'),
      row('/index.ts:42:9)', { wrapped: true }),
    ]),
    rootPath: ROOT,
    row: 0,
  })

  expect(links).toEqual([
    {
      range: { end: { x: 13, y: 1 }, start: { x: 10, y: 0 } },
      reference: {
        column: 9,
        label: 'src/index.ts:42:9',
        line: 42,
        path: '/Users/dev/app/src/index.ts',
      },
      text: '/Users/dev/app/src/index.ts:42:9',
    },
  ])
})

test('a wrapped path is found from its continuation row too', () => {
  const getLine = buffer([
    row('  at run (/Users/dev/app/src'),
    row('/index.ts:42:9)', { wrapped: true }),
  ])

  expect(readTerminalPathLinks({ getLine, rootPath: ROOT, row: 1 })).toEqual(
    readTerminalPathLinks({ getLine, rootPath: ROOT, row: 0 }),
  )
})

test('rows that merely sit next to each other are not joined', () => {
  const getLine = buffer([row('src/one.ts:1'), row('src/two.ts:2')])

  expect(readTerminalPathLinks({ getLine, rootPath: ROOT, row: 0 }).map(linkText)).toEqual([
    'src/one.ts:1',
  ])
})

test('cells the shell never wrote still hold their column', () => {
  // ghostty renders an untouched cell as nothing at all, so a line with a gap in
  // it would report the link several columns left of where it is painted.
  const links = readTerminalPathLinks({
    getLine: buffer([row(`run${UNWRITTEN.repeat(2)}src/a.ts:1`)]),
    rootPath: ROOT,
    row: 0,
  })

  expect(links[0]?.range).toEqual({ end: { x: 14, y: 0 }, start: { x: 5, y: 0 } })
})

test('trailing prose punctuation is not part of the path', () => {
  const links = readTerminalPathLinks({
    getLine: buffer([row('wrote ./src/main.ts:12.')]),
    rootPath: ROOT,
    row: 0,
  })

  expect(links.map(linkText)).toEqual(['./src/main.ts:12'])
  expect(links[0]?.reference.path).toBe('/Users/dev/app/src/main.ts')
})

test('a url is left to the emulator instead of opening as a file', () => {
  const links = readTerminalPathLinks({
    getLine: buffer([row('docs at https://example.com/a.ts')]),
    rootPath: ROOT,
    row: 0,
  })

  expect(links).toEqual([])
})

test('output that merely looks path-shaped offers nothing to click', () => {
  // A package name, a runtime-internal frame and prose all carry slashes without
  // naming a file anyone can open.
  const getLine = buffer([
    row('lint @typescript-eslint/all'),
    row('at (node:internal/main:22:3)'),
    row('npm ERR! 3 problems and/or 1'),
  ])

  expect(readTerminalPathLinks({ getLine, rootPath: ROOT, row: 0 })).toEqual([])
  expect(readTerminalPathLinks({ getLine, rootPath: ROOT, row: 1 })).toEqual([])
  expect(readTerminalPathLinks({ getLine, rootPath: ROOT, row: 2 })).toEqual([])
})

test('a relative path stays unlinked while no root is known', () => {
  const getLine = buffer([row('  at run (src/index.ts:42:9)')])

  expect(readTerminalPathLinks({ getLine, rootPath: null, row: 0 })).toEqual([])
  expect(readTerminalPathLinks({ getLine, rootPath: ROOT, row: 0 })).toHaveLength(1)
})

test('an absolute path outside the root links by its full path', () => {
  const links = readTerminalPathLinks({
    getLine: buffer([row('open /tmp/build/out.log')]),
    rootPath: ROOT,
    row: 0,
  })

  expect(links[0]?.reference).toEqual({
    column: null,
    label: '/tmp/build/out.log',
    line: null,
    path: '/tmp/build/out.log',
  })
})

test('a row past the end of the buffer has no links', () => {
  expect(
    readTerminalPathLinks({ getLine: buffer([row('src/a.ts')]), rootPath: ROOT, row: 4 }),
  ).toEqual([])
})

function linkText(link: { readonly text: string }) {
  return link.text
}

function buffer(lines: readonly TerminalBufferLine[]): TerminalBufferLineReader {
  return (index) => lines[index]
}

function row(content: string, { wrapped = false } = {}): TerminalBufferLine {
  const codepoints = [...content.padEnd(COLUMNS, UNWRITTEN)].map(
    (character) => character.codePointAt(0) ?? 0,
  )

  return {
    getCell: (x) => {
      const codepoint = codepoints[x]
      if (codepoint === undefined) return undefined

      return { getCodepoint: () => codepoint }
    },
    isWrapped: wrapped,
    length: codepoints.length,
  }
}
