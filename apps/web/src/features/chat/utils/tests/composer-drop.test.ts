import {
  composerDropCarriesFiles,
  composerDropMentionPath,
  type ComposerDropTransfer,
} from '@/features/chat/utils/composer-drop'
import { expect, test } from '../../../../../test/fixtures'

const ROOT_PATH = '/repo/platform'

function transfer(types: string[], text = ''): ComposerDropTransfer {
  return { getData: () => text, types }
}

test('a dragged tree row becomes the path a mention holds', () => {
  expect(
    composerDropMentionPath(transfer(['text/plain'], `${ROOT_PATH}/src/app.ts`), ROOT_PATH),
  ).toBe('src/app.ts')
})

test('a dragged folder keeps no trailing slash', () => {
  expect(
    composerDropMentionPath(transfer(['text/plain'], `${ROOT_PATH}/src/features/`), ROOT_PATH),
  ).toBe('src/features')
})

test('a root path with a trailing slash still resolves its rows', () => {
  expect(
    composerDropMentionPath(transfer(['text/plain'], `${ROOT_PATH}/src/app.ts`), `${ROOT_PATH}/`),
  ).toBe('src/app.ts')
})

test('a path outside the open workspace is not a mention', () => {
  expect(composerDropMentionPath(transfer(['text/plain'], '/etc/hosts'), ROOT_PATH)).toBeNull()
  // A sibling whose name merely starts the same way is outside too.
  expect(
    composerDropMentionPath(transfer(['text/plain'], '/repo/platform-www/x.ts'), ROOT_PATH),
  ).toBeNull()
})

test('the workspace root itself has no relative path to mention', () => {
  expect(composerDropMentionPath(transfer(['text/plain'], ROOT_PATH), ROOT_PATH)).toBeNull()
  expect(composerDropMentionPath(transfer(['text/plain'], `${ROOT_PATH}/`), ROOT_PATH)).toBeNull()
})

test('dragged prose stays text even when a line inside it looks like a path', () => {
  expect(
    composerDropMentionPath(
      transfer(['text/plain'], `see ${ROOT_PATH}/src/app.ts\nand the other one`),
      ROOT_PATH,
    ),
  ).toBeNull()
})

test('an OS file drag is an attachment, never a mention', () => {
  expect(composerDropCarriesFiles(transfer(['Files', 'text/plain']))).toBe(true)
  expect(
    composerDropMentionPath(transfer(['Files', 'text/plain'], `${ROOT_PATH}/a.png`), ROOT_PATH),
  ).toBeNull()
})

test('a drag carrying nothing readable is neither', () => {
  expect(composerDropCarriesFiles(transfer([]))).toBe(false)
  expect(composerDropMentionPath(transfer([]), ROOT_PATH)).toBeNull()
  expect(composerDropMentionPath(transfer(['text/plain'], '   '), ROOT_PATH)).toBeNull()
})
