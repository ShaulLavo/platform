/**
 * Returns a shallow copy of `values` with every `null` or `undefined` entry
 * removed. Useful for building request bodies where a key should be absent
 * rather than sent as an explicit null/undefined.
 */
export function omitNullish<T extends object>(values: T): { [K in keyof T]?: NonNullable<T[K]> } {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null),
  ) as { [K in keyof T]?: NonNullable<T[K]> }
}

/*
 * No `omitKey` here on purpose. Three record-minus-one-key helpers remain in
 * the app (`features/editor/state/workspace-document-service.ts`,
 * `features/editor/state/conflict-state.tsx`,
 * `features/chat-mode/state/rail-order-store.ts`) and they do not agree. The
 * first two return the *same object identity* when the key is absent; the
 * third always allocates, and it is not even a named helper — it is a
 * `delete next[key]` on a copy. Store subscribers depend on that identity.
 * Unifying them needs a test per call site, not a shared helper.
 *
 * A fourth lived in the generic record widget until plan 042 deleted it.
 */
