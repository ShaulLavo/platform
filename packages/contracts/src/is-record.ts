/**
 * Canonical type guard for plain (non-null, non-array) object values.
 *
 * Returns `true` when `value` is a non-null object that is not an array,
 * otherwise `false`. Matches the existing reference implementation in
 * `packages/editor-lsp/src/capabilities.ts` and is the single source of
 * truth for the `isRecord` utility across `apps/` and `packages/`.
 *
 * @see Requirements 3.1, 3.6 of the codebase-review-remediation spec.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
