import type { TreeEntry } from './tree-entry'

export type WatchServerMessage =
  | { type: 'ready'; root: string; sequence?: number }
  | { type: 'subscribed'; path: string; sequence?: number }
  | { type: 'unsubscribed'; path: string; sequence?: number }
  | { type: 'pong'; sequence?: number }
  | {
      type: 'created'
      path: string
      entry?: TreeEntry
      origin?: string
      sequence?: number
      version?: string
      writeId?: string
    }
  | {
      type: 'changed'
      path: string
      entry?: TreeEntry
      origin?: string
      sequence?: number
      version?: string
      writeId?: string
    }
  | {
      type: 'deleted'
      path: string
      origin?: string
      sequence?: number
      version?: string
      writeId?: string
    }
  | {
      type: 'renamed'
      path: string
      oldPath: string
      entry?: TreeEntry
      origin?: string
      sequence?: number
      version?: string
      writeId?: string
    }
  | { type: 'error'; code: string; message: string; sequence?: number }

export type WatchClientMessage =
  | { type: 'subscribe'; path: string }
  | { type: 'unsubscribe'; path: string }
  | { type: 'ping' }
