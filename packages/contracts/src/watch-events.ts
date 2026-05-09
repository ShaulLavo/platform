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
