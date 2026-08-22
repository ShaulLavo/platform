import { prepareFileTreeInput, type FileTreePreparedInput } from '@workspace/tree'

const preparedInputByPaths = new WeakMap<readonly string[], FileTreePreparedInput>()

export function preparedTreeInputForPaths(paths: readonly string[]): FileTreePreparedInput {
  const cached = preparedInputByPaths.get(paths)
  if (cached) return cached

  const preparedInput = prepareFileTreeInput(paths, { flattenEmptyDirectories: true })
  preparedInputByPaths.set(paths, preparedInput)
  return preparedInput
}
