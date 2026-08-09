import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { modelSelectionSchema, providerModelSchema } from '../index'

const baseModel = {
  isCustom: false,
  name: 'GPT-5.5',
  shortName: 'GPT-5.5',
  slug: 'gpt-5.5',
}

describe('provider model capabilities', () => {
  it('parses a model that advertises nothing', () => {
    const parsed = v.parse(providerModelSchema, baseModel as unknown)

    expect(parsed.capabilities).toBeNull()
    expect(
      v.parse(providerModelSchema, { ...baseModel, capabilities: null }).capabilities,
    ).toBeNull()
  })

  it('parses efforts with descriptions plus a default level', () => {
    const parsed = v.parse(providerModelSchema, {
      ...baseModel,
      capabilities: {
        defaultReasoningEffort: 'medium',
        reasoningEfforts: [
          { description: 'Balanced', effort: 'medium' },
          { description: 'Maximum reasoning depth', effort: 'max' },
        ],
        supportsExtendedThinking: true,
      },
    } as unknown)

    expect(parsed.capabilities?.defaultReasoningEffort).toBe('medium')
    expect(parsed.capabilities?.reasoningEfforts).toEqual([
      { description: 'Balanced', effort: 'medium' },
      { description: 'Maximum reasoning depth', effort: 'max' },
    ])
    expect(parsed.capabilities?.supportsExtendedThinking).toBe(true)
  })

  it('accepts effort ids this schema has never heard of', () => {
    // A closed picklist here once emptied the whole model list when Codex
    // shipped `ultra`. Providers add levels; the contract must not gate them.
    const parsed = v.parse(providerModelSchema, {
      ...baseModel,
      capabilities: {
        defaultReasoningEffort: 'hyperdrive',
        reasoningEfforts: [
          { effort: 'ultra' },
          { description: 'Newer than us', effort: 'hyperdrive' },
        ],
      },
    } as unknown)

    expect(parsed.capabilities?.reasoningEfforts?.map((option) => option.effort)).toEqual([
      'ultra',
      'hyperdrive',
    ])
    expect(parsed.capabilities?.defaultReasoningEffort).toBe('hyperdrive')
  })

  it('rejects an empty effort id', () => {
    expect(() =>
      v.parse(providerModelSchema, {
        ...baseModel,
        capabilities: { reasoningEfforts: [{ effort: '  ' }] },
      } as unknown),
    ).toThrow()
  })
})

describe('model selection effort', () => {
  it('types the chosen effort while leaving other adapter options open', () => {
    const parsed = v.parse(modelSelectionSchema, {
      model: 'gpt-5.5',
      options: { fastMode: true, reasoningEffort: 'xhigh' },
      providerInstanceId: 'codex',
    } as unknown)

    expect(parsed.options?.reasoningEffort).toBe('xhigh')
    expect(parsed.options?.fastMode).toBe(true)
  })

  it('keeps effort optional and accepts levels only one provider knows', () => {
    expect(
      v.parse(modelSelectionSchema, {
        model: 'gpt-5.5',
        providerInstanceId: 'codex',
      } as unknown).options,
    ).toBeUndefined()
    expect(
      v.parse(modelSelectionSchema, {
        model: 'gpt-5.5',
        options: { reasoningEffort: 'ultra' },
        providerInstanceId: 'codex',
      } as unknown).options?.reasoningEffort,
    ).toBe('ultra')
  })
})
