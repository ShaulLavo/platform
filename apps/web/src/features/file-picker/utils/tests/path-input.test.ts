import { expect, test } from '@/../test/fixtures'

import { absolutePickerPath, parsePickerPathInput } from '@workspace/client-core/files/path-input'

const serverInfo = {
  homePath: 'Users/tester',
  workspaceRoot: '/',
}

test('renders and parses absolute picker paths against the filesystem root', () => {
  expect(absolutePickerPath('Users/tester/Documents', '/')).toBe('/Users/tester/Documents')
  expect(parsePickerPathInput('/Users/tester/Documents', serverInfo)).toEqual({
    error: null,
    path: 'Users/tester/Documents',
  })
})

test('expands home paths and normalizes safe relative segments', () => {
  expect(parsePickerPathInput('~/Projects/../Documents', serverInfo)).toEqual({
    error: null,
    path: 'Users/tester/Documents',
  })
})

test('rejects paths outside a configured workspace root', () => {
  expect(
    parsePickerPathInput('/Users/tester/Elsewhere', {
      homePath: '',
      workspaceRoot: '/Users/tester/Workspace',
    }),
  ).toEqual({
    error: 'That folder is outside the available file system.',
    path: null,
  })
})

test('rejects relative traversal beyond the available root', () => {
  expect(parsePickerPathInput('../../etc', serverInfo)).toEqual({
    error: 'That folder is outside the available file system.',
    path: null,
  })
})
