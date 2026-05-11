import { describe, expect, it } from "bun:test"

import {
  createSearchBufferStore,
  searchGroupsForSnapshot,
} from "./search-buffer-state"
import { searchResultItems } from "./search-result-items"

describe("search buffer store", () => {
  it("tracks loading, matches, completion, and grouping", () => {
    const store = createSearchBufferStore()
    const runId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: "repo",
      query: "needle",
    })

    store.getState().appendEvent(runId, {
      match: {
        kind: "content",
        path: "repo/src/app.ts",
        source: "disk",
        type: "file",
      },
      type: "match",
    })
    store.getState().appendEvent(runId, {
      count: 1,
      path: "repo",
      query: "needle",
      truncated: false,
      type: "done",
    })

    const snapshot = store.getState().active
    expect(snapshot).toMatchObject({
      query: "needle",
      status: "ready",
      totalCount: 1,
      truncated: false,
    })
    expect(searchGroupsForSnapshot(snapshot)).toEqual([
      expect.objectContaining({
        name: "app.ts",
        path: "repo/src/app.ts",
      }),
    ])
  })

  it("ignores stale events from previous runs", () => {
    const store = createSearchBufferStore()
    const staleRunId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: "repo",
      query: "first",
    })
    const currentRunId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: "repo",
      query: "second",
    })

    store.getState().appendEvent(staleRunId, {
      match: {
        kind: "content",
        path: "repo/stale.ts",
        source: "disk",
        type: "file",
      },
      type: "match",
    })
    store.getState().appendEvent(currentRunId, {
      count: 0,
      path: "repo",
      query: "second",
      truncated: false,
      type: "done",
    })

    expect(store.getState().active).toMatchObject({
      matches: [],
      query: "second",
      status: "ready",
    })
  })

  it("keeps previous results visible while a new query is loading", () => {
    const store = createSearchBufferStore()
    const firstRunId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: "repo",
      query: "first",
    })
    store.getState().appendEvent(firstRunId, {
      match: {
        kind: "content",
        path: "repo/first.ts",
        source: "disk",
        type: "file",
      },
      type: "match",
    })
    store.getState().appendEvent(firstRunId, {
      count: 1,
      path: "repo",
      query: "first",
      truncated: false,
      type: "done",
    })

    store.getState().setQuery("repo", "second")

    expect(store.getState().active).toMatchObject({
      matches: [expect.objectContaining({ path: "repo/first.ts" })],
      query: "second",
      resultsQuery: "first",
      status: "loading",
    })
  })

  it("replaces previous results when the next query returns its first match", () => {
    const store = createSearchBufferStore()
    const firstRunId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: "repo",
      query: "first",
    })
    store.getState().appendEvent(firstRunId, {
      match: {
        kind: "content",
        path: "repo/first.ts",
        source: "disk",
        type: "file",
      },
      type: "match",
    })
    store.getState().appendEvent(firstRunId, {
      count: 1,
      path: "repo",
      query: "first",
      truncated: false,
      type: "done",
    })

    const secondRunId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: "repo",
      query: "second",
    })
    store.getState().appendEvent(secondRunId, {
      match: {
        kind: "content",
        path: "repo/second.ts",
        source: "disk",
        type: "file",
      },
      type: "match",
    })

    expect(store.getState().active).toMatchObject({
      matches: [expect.objectContaining({ path: "repo/second.ts" })],
      resultsQuery: "second",
      status: "loading",
      totalCount: 1,
    })
  })

  it("appends batched events and can collapse file groups", () => {
    const store = createSearchBufferStore()
    const runId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: "repo",
      query: "needle",
    })

    store.getState().appendEvents(runId, [
      {
        match: {
          kind: "content",
          path: "repo/src/app.ts",
          source: "disk",
          type: "file",
        },
        type: "match",
      },
      {
        match: {
          kind: "content",
          path: "repo/src/app.ts",
          source: "disk",
          type: "file",
        },
        type: "match",
      },
    ])
    store.getState().toggleGroup("repo/src/app.ts")

    expect(searchGroupsForSnapshot(store.getState().active)).toEqual([
      expect.objectContaining({
        collapsed: true,
        count: 2,
        path: "repo/src/app.ts",
      }),
    ])
  })

  it("renders filename-only hits as one virtual row", () => {
    const store = createSearchBufferStore()
    const runId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: "repo",
      query: "needle",
    })

    store.getState().appendEvent(runId, {
      match: {
        kind: "name",
        path: "repo/src/needle.ts",
        source: "disk",
        type: "file",
      },
      type: "match",
    })

    expect(
      searchResultItems(searchGroupsForSnapshot(store.getState().active))
    ).toEqual([expect.objectContaining({ type: "name" })])
  })

  it("keeps filename hits out of content group counts", () => {
    const store = createSearchBufferStore()
    const runId = store.getState().startSearch({
      includeContent: true,
      includeNames: true,
      limit: 20,
      path: "repo",
      query: "needle",
    })

    store.getState().appendEvents(runId, [
      {
        match: {
          kind: "name",
          path: "repo/src/needle.ts",
          source: "disk",
          type: "file",
        },
        type: "match",
      },
      {
        match: {
          column: 1,
          endColumn: 7,
          kind: "content",
          line: 1,
          path: "repo/src/needle.ts",
          source: "disk",
          type: "file",
        },
        type: "match",
      },
    ])

    const groups = searchGroupsForSnapshot(store.getState().active)
    const items = searchResultItems(groups)

    expect(groups).toEqual([
      expect.objectContaining({
        count: 1,
        matches: [
          expect.objectContaining({ kind: "name" }),
          expect.objectContaining({ kind: "content" }),
        ],
      }),
    ])
    expect(items).toEqual([
      expect.objectContaining({
        group: expect.objectContaining({ count: 1 }),
        type: "group",
      }),
      expect.objectContaining({
        match: expect.objectContaining({ kind: "content" }),
        type: "match",
      }),
    ])
  })
})
