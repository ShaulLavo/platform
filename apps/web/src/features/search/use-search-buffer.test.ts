import { describe, expect, it } from "bun:test"
import type { WorkspaceSearchEvent } from "@workspace/contracts"

import {
  createFirstPaintSearchEventBatcher,
  runSearch,
  workspaceSearchQuery,
} from "./use-search-buffer"
import { createSearchBufferStore } from "./search-buffer-state"

describe("workspace search buffer query", () => {
  it("uses content-only workspace search by default", () => {
    expect(workspaceSearchQuery("repo", "needle")).toMatchObject({
      caseSensitive: false,
      entryType: "file",
      excludeGlobs: [],
      includeContent: true,
      includeGlobs: [],
      includeNames: false,
      matchMode: "literal",
      path: "repo",
      query: "needle",
      wholeWord: false,
    })
  })

  it("builds workspace search queries with mode and glob options", () => {
    expect(
      workspaceSearchQuery("repo", "needle", {
        caseSensitive: true,
        excludeGlobText: "*.test.ts",
        filtersVisible: true,
        includeGlobText: "src/**/*.ts, tests/{unit,integration}/**/*.ts",
        matchMode: "regex",
        wholeWord: true,
      })
    ).toMatchObject({
      caseSensitive: true,
      excludeGlobs: ["*.test.ts"],
      includeGlobs: ["src/**/*.ts", "tests/{unit,integration}/**/*.ts"],
      matchMode: "regex",
      wholeWord: true,
    })
  })

  it("ignores glob field text while filters are hidden", () => {
    expect(
      workspaceSearchQuery("repo", "needle", {
        excludeGlobText: "*.test.ts",
        filtersVisible: false,
        includeGlobText: "src/**/*.ts",
      })
    ).toMatchObject({
      excludeGlobs: [],
      includeGlobs: [],
    })
  })
})

describe("workspace search first paint gate", () => {
  it("buffers initial open-buffer matches until the first disk match", () => {
    const recorder = createRecordingBatcher()
    const gate = createFirstPaintSearchEventBatcher(recorder.batcher, true)
    const openMatch = matchEvent("open-buffer", "repo/src/dirty.ts")
    const diskMatch = matchEvent("disk", "repo/src/disk.ts")

    gate.push(openMatch)
    expect(recorder.pending()).toEqual([])
    expect(recorder.flushed).toEqual([])

    gate.push(diskMatch)
    expect(recorder.flushed).toEqual([[openMatch, diskMatch]])
  })

  it("passes open-buffer matches through when first-paint gating is disabled", () => {
    const recorder = createRecordingBatcher()
    const gate = createFirstPaintSearchEventBatcher(recorder.batcher, false)
    const openMatch = matchEvent("open-buffer", "repo/src/dirty.ts")

    gate.push(openMatch)

    expect(recorder.pending()).toEqual([openMatch])
    expect(recorder.flushed).toEqual([])
  })

  it("flushes buffered open-buffer matches when the search completes", () => {
    const recorder = createRecordingBatcher()
    const gate = createFirstPaintSearchEventBatcher(recorder.batcher, true)
    const openMatch = matchEvent("open-buffer", "repo/src/dirty.ts")

    gate.push(openMatch)
    gate.flush()

    expect(recorder.flushed).toEqual([[openMatch]])
  })

  it("drops buffered open-buffer matches on abort disposal", () => {
    const recorder = createRecordingBatcher()
    const gate = createFirstPaintSearchEventBatcher(recorder.batcher, true)

    gate.push(matchEvent("open-buffer", "repo/src/dirty.ts"))
    gate.dispose()

    expect(recorder.pending()).toEqual([])
    expect(recorder.flushed).toEqual([])
    expect(recorder.disposed()).toBe(true)
  })

  it("does not publish buffered open-buffer matches on search error", () => {
    const recorder = createRecordingBatcher()
    const gate = createFirstPaintSearchEventBatcher(recorder.batcher, true)

    gate.push(matchEvent("open-buffer", "repo/src/dirty.ts"))
    gate.fail()

    expect(recorder.pending()).toEqual([])
    expect(recorder.flushed).toEqual([])
  })

  it("drops buffered open-buffer matches when the run receives an error event", async () => {
    const store = createSearchBufferStore()
    const query = workspaceSearchQuery("repo", "needle")
    const runId = store.getState().startSearch(query)
    const provider = {
      async *search() {
        yield matchEvent("open-buffer", "repo/src/dirty.ts")
        yield {
          code: "search_failed",
          message: "Search failed.",
          type: "error" as const,
        }
      },
    }

    await runSearch(provider, query, runId, store, new AbortController().signal, {
      deferInitialOpenBufferMatches: true,
    })

    expect(store.getState().active).toMatchObject({
      error: "Search failed.",
      matches: [],
      status: "error",
    })
  })
})

function createRecordingBatcher() {
  let pending: WorkspaceSearchEvent[] = []
  let disposed = false
  const flushed: WorkspaceSearchEvent[][] = []

  return {
    batcher: {
      dispose() {
        disposed = true
        pending = []
      },
      flush() {
        if (pending.length === 0) return

        flushed.push(pending)
        pending = []
      },
      push(event: WorkspaceSearchEvent) {
        pending.push(event)
      },
      pushMany(events: readonly WorkspaceSearchEvent[]) {
        pending.push(...events)
      },
    },
    disposed: () => disposed,
    flushed,
    pending: () => pending,
  }
}

function matchEvent(
  source: "disk" | "open-buffer",
  path: string
): WorkspaceSearchEvent {
  return {
    match: {
      kind: "content",
      path,
      source,
      type: "file",
    },
    type: "match",
  }
}
