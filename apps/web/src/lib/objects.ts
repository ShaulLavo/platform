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
 * No `omitKey` here on purpose. The four record-minus-one-key helpers in the app
 * (`features/editor/state/workspace-document-service.ts`,
 * `features/editor/state/editor-conflict-state.tsx`,
 * `features/settings/components/widgets/record-widget.tsx`,
 * `features/chat-mode/state/rail-order-store.ts`) use two different generic
 * signatures, and three of the four return the *same object identity* when the
 * key is absent while the fourth always allocates. Store subscribers depend on
 * that. Unifying them needs a test per call site, not a shared helper.
 */
