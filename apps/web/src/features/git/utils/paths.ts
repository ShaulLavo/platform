/** The directory a change row sits in, or '' for a file at the repository root. */
export function parentPath(path: string) {
  const index = path.lastIndexOf('/')
  if (index < 0) return ''

  return path.slice(0, index)
}
