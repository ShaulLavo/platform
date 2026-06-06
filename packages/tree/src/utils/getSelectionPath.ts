import { FLATTENED_PREFIX } from '@workspace/tree/utils/constants'

export const getSelectionPath = (path: string): string =>
  path.startsWith(FLATTENED_PREFIX) ? path.slice(FLATTENED_PREFIX.length) : path
