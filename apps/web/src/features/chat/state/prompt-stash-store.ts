import * as v from 'valibot'
import { create } from 'zustand'

/**
 * Prompts the user parked with ⌘S so they could type something else first. The
 * queue is deliberately text-only and provider-agnostic: the point of stashing
 * is to move a prompt to another thread or another model, so nothing about the
 * model it was typed against travels with it.
 */
const PROMPT_STASH_STORAGE_KEY = 'platform.prompt-stash.v1'

/** Newest first, oldest evicted. Deep enough to park a morning's worth of ideas. */
export const MAX_PROMPT_STASH_ENTRIES = 20

const stashEntrySchema = v.object({
  createdAt: v.string(),
  id: v.pipe(v.string(), v.minLength(1)),
  prompt: v.pipe(v.string(), v.minLength(1)),
})

const stashStorageSchema = v.object({ entries: v.array(stashEntrySchema) })

export type PromptStashEntry = v.InferOutput<typeof stashEntrySchema>

type PromptStashStore = {
  entries: readonly PromptStashEntry[]
  /** Drops an entry without restoring it. */
  removeEntry: (entryId: string) => void
  /**
   * Prepends a prompt to the queue. Returns the entry, or `null` when there was
   * nothing to stash or the write failed outright — the composer is cleared on
   * the strength of this landing, so a failed write must not report success.
   */
  stashPrompt: (prompt: string) => PromptStashEntry | null
  /** Removes and returns an entry: restoring one is also spending it. */
  takeEntry: (entryId: string) => PromptStashEntry | null
}

type StashStorage = Pick<Storage, 'getItem' | 'setItem'>

// Ids only have to be unique within the queue, and two stashes can land in the
// same millisecond, so the clock is paired with a counter rather than trusted
// alone. Module scope, but deterministic — no import-time randomness.
let entrySequence = 0

/**
 * Reading the `localStorage` property itself can throw when storage is blocked
 * by policy, so the access is guarded rather than only the get/set calls on it —
 * otherwise importing this module would take down the app at load. Where there
 * is no storage at all the queue still works for the session; it simply does not
 * outlive the tab.
 */
function resolveStashStorage(): StashStorage {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Blocked by policy: fall through to the in-memory queue.
  }

  const values = new Map<string, string>()

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

const stashStorage = resolveStashStorage()

function readPersistedEntries(): readonly PromptStashEntry[] {
  const raw = stashStorage.getItem(PROMPT_STASH_STORAGE_KEY)
  if (!raw) return []

  try {
    const parsed = v.safeParse(stashStorageSchema, JSON.parse(raw))

    return parsed.success ? parsed.output.entries : []
  } catch {
    return []
  }
}

/**
 * Persists immediately rather than debounced: stashing is one deliberate
 * keystroke, not a per-character autosave, so there is nothing to coalesce and
 * the caller needs an honest answer about whether the write landed.
 */
function writeEntries(entries: readonly PromptStashEntry[]) {
  try {
    stashStorage.setItem(PROMPT_STASH_STORAGE_KEY, JSON.stringify({ entries }))

    return true
  } catch {
    return false
  }
}

export const usePromptStashStore = create<PromptStashStore>((set, get) => ({
  entries: readPersistedEntries(),
  removeEntry: (entryId) => {
    const entries = get().entries
    const next = entries.filter((entry) => entry.id !== entryId)
    if (next.length === entries.length) return

    writeEntries(next)
    set({ entries: next })
  },
  stashPrompt: (prompt) => {
    const trimmed = prompt.trim()
    if (!trimmed) return null

    entrySequence += 1
    const entry: PromptStashEntry = {
      createdAt: new Date().toISOString(),
      id: `stash-${Date.now()}-${entrySequence}`,
      prompt: trimmed,
    }
    const next = [entry, ...get().entries].slice(0, MAX_PROMPT_STASH_ENTRIES)
    // A rejected write must leave nothing behind: the caller keeps the composer
    // intact on failure, and a visible-but-unwritten entry would duplicate it.
    if (!writeEntries(next)) return null

    set({ entries: next })

    return entry
  },
  takeEntry: (entryId) => {
    const entries = get().entries
    const entry = entries.find((candidate) => candidate.id === entryId)
    if (!entry) return null

    const next = entries.filter((candidate) => candidate.id !== entryId)
    writeEntries(next)
    set({ entries: next })

    return entry
  },
}))

export function resetPromptStashStore() {
  writeEntries([])
  usePromptStashStore.setState({ entries: [] })
}
