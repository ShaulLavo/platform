/**
 * Shared workspace-watch message contracts.
 *
 * Mirrors the Valibot `watchServerMessageSchema` and
 * `watchClientMessageSchema` defined in
 * `apps/server/src/fs/contracts.ts`. The server retains the Valibot
 * schemas as the runtime validation source; this module declares the
 * equivalent pure-TypeScript unions so the web app can consume them
 * without inferring them through the Eden type bridge or redeclaring
 * them locally.
 *
 * Structural equivalence between these unions and the server's
 * `v.InferOutput<typeof watchServerMessageSchema>` /
 * `v.InferOutput<typeof watchClientMessageSchema>` is enforced at
 * compile time by parity assertions colocated with the server
 * schemas (see task 3.2 of the codebase-review-remediation spec).
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.7 of the codebase-review-remediation spec.
 */

import type { TreeEntry } from "./tree-entry"

/**
 * Server-originated watch stream message. Mirrors the variants of
 * `watchServerMessageSchema` in `apps/server/src/fs/contracts.ts`.
 */
export type WatchServerMessage =
  | { type: "ready"; root: string }
  | { type: "subscribed"; path: string }
  | { type: "unsubscribed"; path: string }
  | { type: "pong" }
  | { type: "created"; path: string; entry?: TreeEntry }
  | { type: "changed"; path: string; entry?: TreeEntry }
  | { type: "deleted"; path: string }
  | { type: "renamed"; path: string; oldPath: string; entry?: TreeEntry }
  | { type: "error"; code: string; message: string }

/**
 * Client-originated watch control message. Mirrors the variants of
 * `watchClientMessageSchema` in `apps/server/src/fs/contracts.ts`.
 */
export type WatchClientMessage =
  | { type: "subscribe"; path: string }
  | { type: "unsubscribe"; path: string }
  | { type: "ping" }
