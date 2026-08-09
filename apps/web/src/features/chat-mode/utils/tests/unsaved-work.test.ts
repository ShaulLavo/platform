import { unsavedWorkPrompt } from '@/features/chat-mode/utils/unsaved-work'
import { expect, test } from '../../../../../test/fixtures'

test('names every unsaved file so the choice is informed', () => {
  const prompt = unsavedWorkPrompt(new Set(['/repo/src/b.ts', '/repo/src/a.ts']))

  expect(prompt).toContain('2 files')
  expect(prompt).toContain('a.ts')
  expect(prompt).toContain('b.ts')
  expect(prompt.indexOf('a.ts')).toBeLessThan(prompt.indexOf('b.ts'))
})

test('uses the singular for one file', () => {
  expect(unsavedWorkPrompt(new Set(['/repo/src/only.ts']))).toContain('1 file:')
})
