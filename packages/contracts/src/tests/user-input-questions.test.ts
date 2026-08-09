import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { userInputQuestionSchema, userInputQuestionsSchema } from '../index'

describe('user input questions', () => {
  it('round-trips a free-text question and defaults its answer kind', () => {
    const parsed = v.parse(userInputQuestionSchema, {
      id: 'q-branch',
      prompt: 'Which branch should I target?',
    } as unknown)

    expect(parsed).toEqual({
      allowOther: false,
      answerKind: 'text',
      id: 'q-branch',
      options: [],
      prompt: 'Which branch should I target?',
      secret: false,
    })
  })

  it('round-trips a single-select question with described options', () => {
    const parsed = v.parse(userInputQuestionSchema, {
      answerKind: 'single-select',
      header: 'Deploy target',
      id: 'q-env',
      options: [
        { description: 'Safe to break', label: 'Staging', value: 'staging' },
        { label: 'Production', value: 'production' },
      ],
      prompt: 'Where should this go?',
    } as unknown)

    expect(parsed.answerKind).toBe('single-select')
    expect(parsed.header).toBe('Deploy target')
    expect(parsed.options).toEqual([
      { description: 'Safe to break', label: 'Staging', value: 'staging' },
      { label: 'Production', value: 'production' },
    ])
  })

  it('round-trips a multi-select question that also accepts a typed answer', () => {
    const parsed = v.parse(userInputQuestionSchema, {
      allowOther: true,
      answerKind: 'multi-select',
      id: 'q-files',
      options: [
        { label: 'server.ts', value: 'src/server.ts' },
        { label: 'client.ts', value: 'src/client.ts' },
      ],
      prompt: 'Which files may I touch?',
    } as unknown)

    expect(parsed.answerKind).toBe('multi-select')
    expect(parsed.allowOther).toBe(true)
    expect(parsed.options).toHaveLength(2)
  })

  it('keeps unknown provider fields instead of rejecting the question', () => {
    const parsed = v.parse(userInputQuestionSchema, {
      autoResolutionMs: 30_000,
      id: 'q-open',
      options: [{ isOther: true, label: 'Other', value: 'other' }],
      prompt: 'Anything else?',
    } as unknown)

    expect(parsed.autoResolutionMs).toBe(30_000)
    expect(parsed.options[0]?.isOther).toBe(true)
  })

  it('rejects a question with no id or prompt and parses the batch payload', () => {
    expect(() => v.parse(userInputQuestionSchema, { prompt: 'no id' } as unknown)).toThrow()
    expect(() => v.parse(userInputQuestionSchema, { id: 'q-1', prompt: '  ' } as unknown)).toThrow()
    expect(() =>
      v.parse(userInputQuestionSchema, { answerKind: 'ranked', id: 'q-1', prompt: 'x' }),
    ).toThrow()

    const batch = v.parse(userInputQuestionsSchema, [
      { id: 'q-1', prompt: 'First?' },
      {
        answerKind: 'single-select',
        id: 'q-2',
        options: [{ label: 'Yes', value: 'yes' }],
        prompt: 'Second?',
      },
    ] as unknown)

    expect(batch.map((question) => question.answerKind)).toEqual(['text', 'single-select'])
  })
})
