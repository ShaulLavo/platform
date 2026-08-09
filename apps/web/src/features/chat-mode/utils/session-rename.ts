export type SessionRenameOutcome =
  /** Nothing to send: the title came back unchanged. */
  | { readonly kind: 'unchanged' }
  /** The field was cleared. The server rejects blank titles, so this is a refusal. */
  | { readonly kind: 'empty' }
  | { readonly kind: 'commit'; readonly title: string }

/**
 * The single rule for committing a session rename, shared by the rail row and the
 * stage header. Blank is its own outcome rather than a silent no-op: dropping the
 * edit without a word is indistinguishable from a rename that failed.
 */
export function sessionRenameOutcome(value: string, currentTitle: string): SessionRenameOutcome {
  const title = value.trim()
  if (!title) return { kind: 'empty' }
  if (title === currentTitle) return { kind: 'unchanged' }

  return { kind: 'commit', title }
}
