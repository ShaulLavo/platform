/**
 * What the confirmation actually asks. The cascade is the dangerous part, so the
 * session count leads whenever there is anything to cascade onto.
 */
export function projectDeletePrompt({
  sessionCount,
  title,
}: {
  readonly sessionCount: number
  readonly title: string
}) {
  if (sessionCount === 0) return `Permanently delete “${title}”? This cannot be undone.`
  if (sessionCount === 1) {
    return `Permanently delete “${title}” and the session in it? This cannot be undone.`
  }

  return `Permanently delete “${title}” and the ${sessionCount} sessions in it? This cannot be undone.`
}
