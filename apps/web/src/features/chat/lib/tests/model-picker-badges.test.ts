import {
  providerDriverKindSchema,
  providerInstanceIdSchema,
  type ProviderSnapshot,
} from '@workspace/contracts'
import * as v from 'valibot'

import { expect, test } from '../../../../../test/fixtures'

import { isNewProviderModel, modelPickerRowBadges } from '@/features/chat/lib/model-picker-badges'
import { providerModelOptions } from '@/features/chat/lib/provider-model-options'
import { providerModel as model, providerSnapshot } from '../../../../../test/factories/chat'

function optionFor(overrides: Partial<ProviderSnapshot> = {}) {
  return providerModelOptions([providerSnapshot({ models: [model()], ...overrides })])[0]
}

function claudeOption(slug: string) {
  return providerModelOptions([
    providerSnapshot({
      displayLabel: 'Claude Code',
      driverKind: v.parse(providerDriverKindSchema, 'claude'),
      models: [model({ name: 'Claude Opus 5', shortName: 'Opus 5', slug })],
      providerInstanceId: v.parse(providerInstanceIdSchema, 'claude'),
    }),
  ])[0]
}

test('a model advertising extended thinking earns the capability badge', () => {
  const option = optionFor({
    models: [model({ capabilities: { supportsExtendedThinking: true } })],
  })

  expect(option.supportsThinking).toBe(true)
  expect(modelPickerRowBadges(option, null)).toEqual([
    { key: 'thinking', label: 'Thinks', title: 'Supports extended thinking' },
  ])
})

test('a plain model earns no badges at all', () => {
  expect(modelPickerRowBadges(optionFor(), null)).toEqual([])
})

test('the chosen reasoning level leads the badges and a custom model follows it', () => {
  const option = optionFor({
    models: [model({ capabilities: { supportsExtendedThinking: true }, isCustom: true })],
  })

  expect(modelPickerRowBadges(option, 'xhigh').map((badge) => badge.label)).toEqual([
    'X-High',
    'Custom',
  ])
})

test('only the two most specific badges survive, so the model name keeps its width', () => {
  const option = optionFor({
    models: [model({ capabilities: { supportsExtendedThinking: true }, isCustom: true })],
  })

  expect(modelPickerRowBadges(option, 'high')).toHaveLength(2)
})

test('the new marker is keyed by driver kind and slug together', () => {
  expect(isNewProviderModel(claudeOption('claude-opus-5'))).toBe(true)
  expect(isNewProviderModel(claudeOption('claude-sonnet-5'))).toBe(false)
  // Same slug under a different driver is a different model.
  expect(isNewProviderModel(optionFor({ models: [model({ slug: 'claude-opus-5' })] }))).toBe(false)
})
