import { externalLinkHost } from '@/features/chat/lib/markdown-external-links'
import { expect, test } from '../../../../../test/fixtures'

test('only web destinations count as external links', () => {
  expect(externalLinkHost('https://example.com/guide')).toBe('example.com')
  expect(externalLinkHost('http://localhost:5173/x')).toBe('localhost')
  expect(externalLinkHost('mailto:someone@example.com')).toBeNull()
  expect(externalLinkHost('#section')).toBeNull()
  expect(externalLinkHost('src/foo.ts')).toBeNull()
  expect(externalLinkHost(undefined)).toBeNull()
})
