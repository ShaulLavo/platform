import {
  resolveInlineCodeFileReference,
  resolveMarkdownLinkFileReference,
} from '@/features/chat/utils/markdown-file-links'
import { expect, test } from '../../../../../test/fixtures'

const ROOT = '/repo'

test('an inline path with a line resolves against the workspace root', () => {
  expect(resolveInlineCodeFileReference('src/foo.ts:42', ROOT)).toEqual({
    column: null,
    label: 'src/foo.ts:42',
    line: 42,
    path: '/repo/src/foo.ts',
  })
})

test('an inline path keeps its column when one is written', () => {
  expect(resolveInlineCodeFileReference('src/foo.ts:42:7', ROOT)).toEqual({
    column: 7,
    label: 'src/foo.ts:42:7',
    line: 42,
    path: '/repo/src/foo.ts',
  })
})

test('an absolute path outside the workspace keeps its absolute label', () => {
  expect(resolveInlineCodeFileReference('/Users/me/other/app.ts:3', ROOT)).toEqual({
    column: null,
    label: '/Users/me/other/app.ts:3',
    line: 3,
    path: '/Users/me/other/app.ts',
  })
})

test('relative segments collapse before the reference is built', () => {
  expect(resolveInlineCodeFileReference('./src/../src/foo.ts', ROOT)?.path).toBe('/repo/src/foo.ts')
})

test('identifiers, hosts, versions and refs are not file references', () => {
  expect(resolveInlineCodeFileReference('node.meta', ROOT)).toBeNull()
  expect(resolveInlineCodeFileReference('example.com/guide', ROOT)).toBeNull()
  expect(resolveInlineCodeFileReference('127.0.0.1:8080', ROOT)).toBeNull()
  expect(resolveInlineCodeFileReference('https://example.com/a.ts', ROOT)).toBeNull()
  expect(resolveInlineCodeFileReference('bun run test', ROOT)).toBeNull()
})

test('a relative markdown link destination resolves to a file', () => {
  expect(resolveMarkdownLinkFileReference('src/deep/mod.ts', ROOT)?.path).toBe(
    '/repo/src/deep/mod.ts',
  )
})

test('a markdown link line fragment becomes the reference line', () => {
  expect(resolveMarkdownLinkFileReference('src/foo.ts#L12', ROOT)).toMatchObject({
    line: 12,
    path: '/repo/src/foo.ts',
  })
})

test('web links and anchors are never file references', () => {
  expect(resolveMarkdownLinkFileReference('https://example.com/guide', ROOT)).toBeNull()
  expect(resolveMarkdownLinkFileReference('#section', ROOT)).toBeNull()
  expect(resolveMarkdownLinkFileReference('mailto:someone@example.com', ROOT)).toBeNull()
})

test('a relative reference without a workspace root cannot be opened', () => {
  expect(resolveInlineCodeFileReference('src/foo.ts:42', null)).toBeNull()
  expect(resolveMarkdownLinkFileReference('src/foo.ts', null)).toBeNull()
})

test('a file reference at the configured filesystem root keeps its API-relative path', () => {
  expect(resolveInlineCodeFileReference('src/main.ts:8', '')).toEqual({
    path: 'src/main.ts',
    line: 8,
    column: null,
    label: 'src/main.ts:8',
  })
  expect(resolveInlineCodeFileReference('src/main.ts:8', 'repo')).toEqual({
    path: 'repo/src/main.ts',
    line: 8,
    column: null,
    label: 'src/main.ts:8',
  })
})
