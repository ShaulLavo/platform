/**
 * What the confirmation actually asks. A bulk delete named after one of its rows is the
 * classic way to lose the other nine, so the count leads whenever there is more than one.
 */
export function sessionDeletePrompt({
  count,
  title,
}: {
  readonly count: number
  readonly title: string
}) {
  if (count > 1) {
    return `Permanently delete ${count} sessions and everything said in them? This cannot be undone.`
  }

  return `Permanently delete “${title}” and everything said in it? This cannot be undone.`
}

export function sessionDeleteTitle(count: number) {
  if (count > 1) return `Delete ${count} sessions`

  return 'Delete session'
}
