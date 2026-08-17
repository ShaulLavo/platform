import { fenceIconFileName, fenceTitle } from '@/features/chat/utils/markdown-fence'
import { expect, test } from '../../../../../test/fixtures'

test('a fence title is read from an attribute or from a bare filename', () => {
  expect(fenceTitle('title="src/foo.ts"')).toBe('src/foo.ts')
  expect(fenceTitle("filename='src/foo.ts'")).toBe('src/foo.ts')
  expect(fenceTitle('{1,3} file=src/foo.ts')).toBe('src/foo.ts')
  expect(fenceTitle('src/foo.ts')).toBe('src/foo.ts')
})

test('line-range and highlight metadata is not mistaken for a title', () => {
  expect(fenceTitle('{1,3}')).toBeNull()
  expect(fenceTitle('showLineNumbers')).toBeNull()
  expect(fenceTitle(undefined)).toBeNull()
})

test('the icon name falls back to a synthetic file name for the language', () => {
  expect(fenceIconFileName('src/deep/foo.ts', 'ts')).toBe('foo.ts')
  expect(fenceIconFileName(null, 'typescript')).toBe('file.ts')
  expect(fenceIconFileName(null, 'Python')).toBe('file.py')
  expect(fenceIconFileName(null, 'go')).toBe('file.go')
})
