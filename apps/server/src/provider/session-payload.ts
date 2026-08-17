import {
  interactionModeSchema,
  modelSelectionSchema,
  runtimeModeSchema,
  turnIdSchema,
  type ModelSelection,
} from '@workspace/contracts'
import * as v from 'valibot'

/**
 * Everything a provider session remembers about itself between turns, stored as
 * one JSON column (`provider_session_runtime.runtime_payload_json`).
 *
 * Parsed exactly once, on the way out of SQLite in `rowToBinding`. That is what
 * makes `canReuseProviderBinding` — the predicate deciding whether a live child
 * process is reused or torn down — a typed comparison instead of a key sniff.
 * `v.object` drops unknown entries, so a mistyped key cannot survive a round
 * trip and quietly cost a session restart.
 *
 * Every field is optional because the six upsert sites write *patches*:
 * `{ activeTurnId: null }` must not erase `cwd`. Session start needs more than
 * that, and says so through `ProviderSessionStartPayload`.
 */
export const providerSessionRuntimePayloadSchema = v.object({
  activeTurnId: v.optional(v.nullable(turnIdSchema)),
  // Non-empty by construction: every producer derives it from
  // `thread.worktreePath ?? project.workspaceRoot`, both of which are
  // `trimmedNonEmptyStringSchema` in contracts. Asserting it here is what lets
  // the checkpoint reactors treat `payload.cwd` as a usable git path.
  cwd: v.optional(v.pipe(v.string(), v.minLength(1))),
  interactionMode: v.optional(interactionModeSchema),
  lastError: v.optional(v.nullable(v.string())),
  lastRuntimeEvent: v.optional(v.string()),
  modelSelection: v.optional(modelSelectionSchema),
  /**
   * Write-only today: three call sites in `ProviderService` record the
   * provider's own conversation id and nothing reads it back. Declared anyway
   * because those writes exist — leaving it out of the schema would silently
   * discard data on every round trip, which is the exact failure this module
   * exists to prevent.
   */
  providerThreadId: v.optional(v.nullable(v.string())),
  runtimeMode: v.optional(runtimeModeSchema),
})

export type ProviderSessionRuntimePayload = v.InferOutput<
  typeof providerSessionRuntimePayloadSchema
>

/**
 * The payload a session *start* requires. `cwd` and `modelSelection` are
 * mandatory here because `providerSessionStartInput` needs both and used to
 * re-derive them from an `unknown` blob, throwing an internal error when they
 * were missing. Requiring them at the one boundary that needs them makes that
 * failure unrepresentable.
 */
export type ProviderSessionStartPayload = ProviderSessionRuntimePayload & {
  cwd: string
  modelSelection: ModelSelection
}
