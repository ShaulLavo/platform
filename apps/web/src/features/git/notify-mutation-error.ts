import { toast } from "sonner"

import { toClientError } from "@/lib/client-error-taxonomy"

/**
 * Surface a failed git mutation through the Client_Error_Taxonomy (Req 7.2).
 *
 * Routing the input through `toClientError` classifies the failure by the
 * same category table as every other client-side error surface (tree loads,
 * file reads, workspace events), so server codes like `GIT_COMMAND_FAILED`
 * and `GIT_REPOSITORY_NOT_FOUND` produce a category-derived, distinct
 * message (Req 7.4) instead of whatever raw string the server attached.
 *
 * The toast is kept git-flavored ("Git command failed") so the feature
 * framing survives the migration; the description is the taxonomy's
 * message. We deliberately do not call `reportError` here — its generic,
 * category-titled toast would stack on top of the git-flavored toast below.
 *
 * `AbortError` is categorized as `unknown` by `toClientError`; we mirror
 * `reportError`'s surface policy and skip the toast for cancellations so
 * the user isn't notified about a mutation they themselves aborted.
 * Logging is delegated to the taxonomy path at call sites that choose to
 * call `reportError` directly.
 */
export function notifyMutationError(error: unknown) {
  const clientError = toClientError(error)

  // Always log so the original cause is observable in devtools, matching
  // the existing `reportError` log shape.
  console.error("[notify-mutation-error]", {
    category: clientError.category,
    message: clientError.message,
    cause: clientError.cause,
  })

  // `unknown` is the taxonomy's silent bucket (AbortError passthrough and
  // unclassified errors) — keep the git surface silent there too so
  // cancelled mutations don't flash a toast.
  if (clientError.category === "unknown") return

  toast.error("Git command failed", {
    description: clientError.message,
  })
}
