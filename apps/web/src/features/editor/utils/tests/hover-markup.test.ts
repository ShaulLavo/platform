import { describe, expect, it } from 'vitest'

import { hoverMarkup } from '@/features/editor/utils/hover-markup'

// Three shapes are legal and servers pick freely, so a wrong flatten does not fail loudly — it
// renders `[object Object]`, or renders nothing and reads as a server with no answer.

describe('hoverMarkup', () => {
  it('takes a plain string', () => {
    expect(hoverMarkup({ contents: 'const a: number' })).toBe('const a: number')
  })

  it('takes MarkupContent', () => {
    expect(hoverMarkup({ contents: { value: '```ts\nconst a: number\n```' } })).toBe(
      '```ts\nconst a: number\n```',
    )
  })

  it('joins an array, which is how several servers send a signature and its docs', () => {
    expect(hoverMarkup({ contents: ['const a: number', { value: 'The count.' }] })).toBe(
      'const a: number\n\nThe count.',
    )
  })

  it('treats whitespace-only content as no answer, so no empty tooltip appears', () => {
    expect(hoverMarkup({ contents: '   \n  ' })).toBeNull()
    expect(hoverMarkup(null)).toBeNull()
  })
})
