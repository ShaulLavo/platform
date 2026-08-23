import { expect, test } from '../../../../../test/fixtures'

import { editorIndentationGuidesSupported } from '@/features/editor/utils/indentation-guides'

test('shows indentation guides for code and structured data', () => {
  expect(editorIndentationGuidesSupported('typescript')).toBe(true)
  expect(editorIndentationGuidesSupported('python')).toBe(true)
  expect(editorIndentationGuidesSupported('json')).toBe(true)
  expect(editorIndentationGuidesSupported('yaml')).toBe(true)
})

test('hides indentation guides for prose, patches, and unknown text', () => {
  expect(editorIndentationGuidesSupported('markdown')).toBe(false)
  expect(editorIndentationGuidesSupported('latex')).toBe(false)
  expect(editorIndentationGuidesSupported('typst')).toBe(false)
  expect(editorIndentationGuidesSupported('diff')).toBe(false)
  expect(editorIndentationGuidesSupported('ini')).toBe(false)
  expect(editorIndentationGuidesSupported(null)).toBe(false)
})
