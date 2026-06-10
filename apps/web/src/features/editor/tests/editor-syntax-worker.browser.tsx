import chatModelSource from '../../../../../../packages/contracts/src/chat-model.ts?raw'
import { expect, test } from 'vitest'
import { createPieceTableSnapshot } from '@singapor/core/document'
import {
  resolveTreeSitterLanguageContribution,
  TreeSitterWorkerClient,
} from '@singapor/tree-sitter'
import { TREE_SITTER_LANGUAGE_CONTRIBUTIONS } from '@singapor/tree-sitter-languages'

test('parses chat-model.ts through the editor Tree-sitter worker', async () => {
  const workerClient = new TreeSitterWorkerClient()
  try {
    await registerDefaultLanguages(workerClient)
    const snapshot = createPieceTableSnapshot(chatModelSource)
    const parsed = await workerClient.parse({
      documentId: 'packages/contracts/src/chat-model.ts',
      snapshotVersion: 1,
      languageId: 'typescript',
      resultMode: 'parseOnly',
      snapshot,
    })
    const queried = await workerClient.queryRange({
      documentId: 'packages/contracts/src/chat-model.ts',
      snapshotVersion: 1,
      languageId: 'typescript',
      includeCaptures: false,
      includeHighlights: true,
      range: { startIndex: 0, endIndex: chatModelSource.length },
    })

    expect(parsed?.snapshotVersion).toBe(1)
    expect(queried?.tokens?.length ?? 0).toBeGreaterThan(0)
  } finally {
    await workerClient.dispose()
  }
})

async function registerDefaultLanguages(workerClient: TreeSitterWorkerClient): Promise<void> {
  const languages = await Promise.all(
    TREE_SITTER_LANGUAGE_CONTRIBUTIONS.map((contribution) =>
      resolveTreeSitterLanguageContribution(contribution),
    ),
  )
  await workerClient.registerLanguages(languages)
}
