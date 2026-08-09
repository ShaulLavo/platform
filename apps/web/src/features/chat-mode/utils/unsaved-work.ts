/**
 * Opening another project resets the workspace, which wipes every live editor buffer.
 * Closing a single dirty tab raises a real dialog; a rail click that reads as "show me
 * this conversation" must not destroy more than that without asking.
 */
export function confirmDiscardingUnsavedWork(dirtyFilePaths: ReadonlySet<string>) {
  if (dirtyFilePaths.size === 0) return true
  if (typeof window === 'undefined') return true
  if (typeof window.confirm !== 'function') return true

  return window.confirm(unsavedWorkPrompt(dirtyFilePaths))
}

export function unsavedWorkPrompt(dirtyFilePaths: ReadonlySet<string>) {
  const names = Array.from(dirtyFilePaths, fileName).toSorted()

  return [
    `Opening another project discards unsaved changes in ${fileCount(names.length)}:`,
    names.join('\n'),
    '',
    'This cannot be undone.',
  ].join('\n')
}

function fileCount(count: number) {
  return count === 1 ? '1 file' : `${count} files`
}

function fileName(path: string) {
  return path.split('/').filter(Boolean).at(-1) ?? path
}
