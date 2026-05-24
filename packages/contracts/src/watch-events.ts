import type { TreeEntry } from './tree-entry'

export type WatchServerMessage =
  | { type: 'ready'; root: string }
  | { type: 'subscribed'; path: string }
  | { type: 'unsubscribed'; path: string }
  | { type: 'pong' }
  | { type: 'created'; path: string; entry?: TreeEntry }
  | { type: 'changed'; path: string; entry?: TreeEntry }
  | { type: 'deleted'; path: string }
  | { type: 'renamed'; path: string; oldPath: string; entry?: TreeEntry }
  | { type: 'error'; code: string; message: string }

export type WatchClientMessage =
  | { type: 'subscribe'; path: string }
  | { type: 'unsubscribe'; path: string }
  | { type: 'ping' }
