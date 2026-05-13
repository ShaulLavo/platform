import { describe, expect, it } from "bun:test"
import type { WorkspaceSearchEvent } from "@workspace/contracts"

import {
  createFirstPaintSearchEventBatcher,
  runSearch,
  workspaceSearchQuery,
} from "./use-search-buffer"
import {
  createSearchBufferStore,
  type SearchBufferStoreApi,
} from "./search-buffer-state"

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

  it("preserves meaningful query whitespace", () => {
    expect(workspaceSearchQuery("repo", "  needle  ")).toMatchObject({
      query: "  needle  ",
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

    await runSearch(
      provider,
      query,
      runId,
      store,
      new AbortController().signal,
      {
        deferInitialOpenBufferMatches: true,
      }
    )

    expect(store.getState().active).toMatchObject({
      error: "Search failed.",
      matches: [],
      status: "error",
    })
  })
})

describe("workspace search event batching", () => {
  it("coalesces synchronous match streams until the terminal event", async () => {
    const recorder = createRecordingSearchStore()
    const query = workspaceSearchQuery("repo", "needle")
    const done = doneEvent(200)
    const provider = {
      async *search() {
        for (let index = 0; index < 200; index += 1) {
          yield matchEvent("disk", `repo/src/file-${index}.ts`)
        }

        yield done
      },
    }

    await runSearch(
      provider,
      query,
      1,
      recorder.store,
      new AbortController().signal
    )

    const batches = appendedEventBatches(recorder.calls)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(200)
    expect(appendedSingleEvents(recorder.calls)).toEqual([done])
  })

  it("flushes pending matches before appending done", async () => {
    const recorder = createRecordingSearchStore()
    const query = workspaceSearchQuery("repo", "needle")
    const match = matchEvent("disk", "repo/src/app.ts")
    const done = doneEvent(1)
    const provider = {
      async *search() {
        yield match
        yield done
      },
    }

    await runSearch(
      provider,
      query,
      1,
      recorder.store,
      new AbortController().signal
    )

    expect(recorder.calls).toEqual([
      { events: [match], runId: 1, type: "appendEvents" },
      { event: done, runId: 1, type: "appendEvent" },
    ])
  })

  it("drops scheduled match batches when a run is aborted", async () => {
    const frames = installAnimationFrameQueue()
    const recorder = createRecordingSearchStore()
    const controller = new AbortController()
    const query = workspaceSearchQuery("repo", "needle")
    const match = matchEvent("disk", "repo/src/app.ts")
    let releaseMatch!: () => void
    const matchReleased = new Promise<void>((resolve) => {
      releaseMatch = resolve
    })
    const provider = {
      async *search(_query: unknown, signal: AbortSignal) {
        yield match
        releaseMatch()
        await waitForAbort(signal)
      },
    }

    try {
      const search = runSearch(
        provider,
        query,
        1,
        recorder.store,
        controller.signal
      )

      await matchReleased
      expect(appendedEventBatches(recorder.calls)).toEqual([])

      controller.abort()
      await search
      frames.runFrames()

      expect(appendedEventBatches(recorder.calls)).toEqual([])
      expect(appendedSingleEvents(recorder.calls)).toEqual([])
    } finally {
      frames.restore()
    }
  })
})

type RecordingSearchCall =
  | {
      events: WorkspaceSearchEvent[]
      runId: number
      type: "appendEvents"
    }
  | {
      event: WorkspaceSearchEvent
      runId: number
      type: "appendEvent"
    }
  | {
      error: string
      runId: number
      type: "failSearch"
    }

function createRecordingSearchStore() {
  const calls: RecordingSearchCall[] = []
  const state = {
    appendEvent(runId: number, event: WorkspaceSearchEvent) {
      calls.push({ event, runId, type: "appendEvent" })
    },
    appendEvents(runId: number, events: readonly WorkspaceSearchEvent[]) {
      calls.push({ events: [...events], runId, type: "appendEvents" })
    },
    failSearch(runId: number, error: string) {
      calls.push({ error, runId, type: "failSearch" })
    },
  }

  return {
    calls,
    store: {
      getState: () => state,
    } as unknown as SearchBufferStoreApi,
  }
}

function appendedEventBatches(calls: readonly RecordingSearchCall[]) {
  return calls
    .filter((call) => call.type === "appendEvents")
    .map((call) => call.events)
}

function appendedSingleEvents(calls: readonly RecordingSearchCall[]) {
  return calls
    .filter((call) => call.type === "appendEvent")
    .map((call) => call.event)
}

function installAnimationFrameQueue() {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window")
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextFrame = 1
  const fakeWindow = {
    cancelAnimationFrame(frame: number) {
      callbacks.delete(frame)
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      const frame = nextFrame
      nextFrame += 1
      callbacks.set(frame, callback)
      return frame
    },
  } as Pick<Window, "cancelAnimationFrame" | "requestAnimationFrame">

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: fakeWindow,
  })

  return {
    restore() {
      if (!original) {
        Reflect.deleteProperty(globalThis, "window")
        return
      }

      Object.defineProperty(globalThis, "window", original)
    },
    runFrames() {
      const frames = [...callbacks.values()]
      callbacks.clear()
      for (const callback of frames) {
        callback(0)
      }
    },
  }
}

function waitForAbort(signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve()

  return new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true })
  })
}

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

function doneEvent(count: number): WorkspaceSearchEvent {
  return {
    count,
    path: "repo",
    query: "needle",
    truncated: false,
    type: "done",
  }
}
