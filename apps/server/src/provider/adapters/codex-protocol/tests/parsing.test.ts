import { describe, expect, it } from 'vitest'
import { parseCodexClientRequestParams, parseCodexClientRequestResult } from '../index'

function codexModel(input: { readonly efforts: readonly string[]; readonly slug: string }) {
  return {
    defaultReasoningEffort: 'medium',
    description: 'Model from a newer Codex release',
    displayName: input.slug.toUpperCase(),
    hidden: false,
    id: input.slug,
    isDefault: false,
    model: input.slug,
    supportedReasoningEfforts: input.efforts.map((effort) => ({
      description: `${effort} effort`,
      reasoningEffort: effort,
    })),
  }
}

describe('Codex protocol parsing', () => {
  it('keeps every model when the CLI advertises efforts newer than the pinned schema', () => {
    const result = parseCodexClientRequestResult('model/list', {
      data: [
        codexModel({
          efforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
          slug: 'gpt-5.6',
        }),
        codexModel({ efforts: ['low', 'medium', 'high', 'xhigh', 'max'], slug: 'gpt-5.6-luna' }),
      ],
      nextCursor: null,
    })

    expect(result.data.map((model) => model.model)).toEqual(['gpt-5.6', 'gpt-5.6-luna'])
    expect(
      result.data[0]?.supportedReasoningEfforts.map((option) => option.reasoningEffort),
    ).toEqual(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
  })

  it('keeps the model list when an effort value is entirely unknown', () => {
    const result = parseCodexClientRequestResult('model/list', {
      data: [codexModel({ efforts: ['medium', 'hyperdrive'], slug: 'gpt-9' })],
      nextCursor: null,
    })

    expect(result.data).toHaveLength(1)
    expect(result.data[0]?.supportedReasoningEfforts[1]?.reasoningEffort).toBe('hyperdrive')
  })

  it('rejects a payload that is structurally wrong rather than merely unfamiliar', () => {
    expect(() =>
      parseCodexClientRequestResult('model/list', { data: [{ id: 'gpt-9' }], nextCursor: null }),
    ).toThrow(/model\/list response/)
  })

  it('relays an effort the pinned schema predates back to the CLI', () => {
    const params = parseCodexClientRequestParams('turn/start', {
      effort: 'ultra',
      input: [{ text: 'hi', text_elements: [], type: 'text' }],
      model: 'gpt-5.6',
      threadId: 'thread-1',
    })

    expect(params.effort).toBe('ultra')
  })
})
