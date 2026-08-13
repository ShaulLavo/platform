import { describe, expect, it } from 'vitest'

import { applyModelPreferences } from '@/features/chat/lib/model-preferences'

import { withMovedModel } from '../utils/patch'

const ref = (model: string) => ({ model, providerInstanceId: 'codex' }) as never
const option = (model: string) =>
  ({ key: model, label: model, modelSelection: ref(model) }) as never

describe('withMovedModel', () => {
  it('appends a model that has no rank yet before moving it', () => {
    // `order` is sparse — it names only the models the user has an opinion
    // about — so "move this up" first has to make it one of them.
    expect(withMovedModel([], ref('b'), -1)).toEqual([ref('b')])
  })

  it('moves a ranked model one place', () => {
    const order = [ref('a'), ref('b'), ref('c')]

    expect(withMovedModel(order, ref('c'), -1)).toEqual([ref('a'), ref('c'), ref('b')])
    expect(withMovedModel(order, ref('a'), 1)).toEqual([ref('b'), ref('a'), ref('c')])
  })

  it('refuses to move past either end', () => {
    const order = [ref('a'), ref('b')]

    expect(withMovedModel(order, ref('a'), -1)).toEqual(order)
    expect(withMovedModel(order, ref('b'), 1)).toEqual(order)
  })
})

describe('the order reaches the picker', () => {
  it('leads with the ranked models and keeps the rest in provider order', () => {
    const options = [option('a'), option('b'), option('c')]

    const ordered = applyModelPreferences(options, { hidden: [], order: [ref('c')] })

    // Unranked models keep provider order exactly: a comparator that invented a
    // rank for them would quietly reshuffle the provider's own sequence.
    expect(ordered.map((entry) => entry.key)).toEqual(['c', 'a', 'b'])
  })

  it('drops hidden models entirely', () => {
    const options = [option('a'), option('b')]

    const visible = applyModelPreferences(options, { hidden: [ref('a')], order: [] })

    expect(visible.map((entry) => entry.key)).toEqual(['b'])
  })
})
