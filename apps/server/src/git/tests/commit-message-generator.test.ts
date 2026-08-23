import { describe, expect, it } from 'vitest'

import { MockProviderAdapter } from '../../provider/adapters/mock'
import { selectCommitMessageModel } from '../commit-message-generator'

describe('commit message model selection', () => {
  it('uses only advertised cheap fallbacks instead of an arbitrary expensive model', async () => {
    const expensive = await providerSnapshot([
      { name: 'Claude Opus 5', shortName: 'Opus', slug: 'claude-opus-5' },
    ])
    const fable = await providerSnapshot([
      { name: 'GPT-5.6 Fable', shortName: 'Fable', slug: 'gpt-5.6-fable' },
    ])
    const nonChatGptLuna = await providerSnapshot([
      { name: 'GPT-5.6 Luna', shortName: 'Luna', slug: 'gpt-5.6-luna' },
    ])
    const cheap = await providerSnapshot([
      { name: 'Claude Opus 5', shortName: 'Opus', slug: 'claude-opus-5' },
      { name: 'Claude Haiku 5', shortName: 'Haiku', slug: 'claude-haiku-5' },
    ])

    expect(selectCommitMessageModel([expensive])).toBeNull()
    expect(selectCommitMessageModel([fable])).toBeNull()
    expect(selectCommitMessageModel([nonChatGptLuna])).toBeNull()
    expect(selectCommitMessageModel([cheap])?.modelSelection).toMatchObject({
      model: 'claude-haiku-5',
    })
  })
})

async function providerSnapshot(models: Array<{ name: string; shortName: string; slug: string }>) {
  const adapter = new MockProviderAdapter({
    auth: { status: 'authenticated', type: 'api-key' },
    models: models.map((model) => ({ capabilities: null, isCustom: false, ...model })),
  })

  return adapter.snapshot()
}
