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

  it("keeps previous results visible while search options change", () => {
    const store = createSearchBufferStore()
    const firstRunId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      matchMode: "literal",
      path: "repo",
      query: "needle",
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
      query: "needle",
      truncated: false,
      type: "done",
    })

    store.getState().setSearchOptions("repo", { matchMode: "regex" })

    expect(store.getState().active).toMatchObject({
      matches: [expect.objectContaining({ path: "repo/first.ts" })],
      matchMode: "regex",
      resultsQuery: "needle",
      status: "loading",
    })
  })

  it("preserves selected search options when a new run starts", () => {
    const store = createSearchBufferStore()

    store.getState().setQuery("repo", "needle")
    store.getState().setSearchOptions("repo", {
      caseSensitive: true,
      excludeGlobText: "*.test.ts",
      filtersVisible: true,
      includeGlobText: "src/**/*.ts",
      matchMode: "regex",
      wholeWord: true,
    })
    store.getState().startSearch({
      caseSensitive: true,
      excludeGlobs: ["*.test.ts"],
      includeContent: true,
      includeGlobs: ["src/**/*.ts"],
      limit: 20,
      matchMode: "regex",
      path: "repo",
      query: "needle",
      wholeWord: true,
    })

    expect(store.getState().active).toMatchObject({
      caseSensitive: true,
      excludeGlobText: "*.test.ts",
      filtersVisible: true,
      includeGlobText: "src/**/*.ts",
      matchMode: "regex",
      status: "loading",
      wholeWord: true,
    })
  })

  it("preserves selected search options when the query is cleared", () => {
    const store = createSearchBufferStore()
    const runId = store.getState().startSearch({
      caseSensitive: true,
      excludeGlobs: ["*.test.ts"],
      includeContent: true,
      includeGlobs: ["src/**/*.ts"],
      limit: 20,
      matchMode: "regex",
      path: "repo",
      query: "needle",
      wholeWord: true,
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
    store.getState().setSearchOptions("repo", {
      caseSensitive: true,
      excludeGlobText: "*.test.ts",
      filtersVisible: true,
      includeGlobText: "src/**/*.ts",
      matchMode: "regex",
      wholeWord: true,
    })
    store.getState().setQuery("repo", "")

    expect(store.getState().active).toMatchObject({
      caseSensitive: true,
      excludeGlobText: "*.test.ts",
      filtersVisible: true,
      includeGlobText: "src/**/*.ts",
      matches: [],
      matchMode: "regex",
      query: "",
      resultsQuery: "",
      status: "idle",
      totalCount: 0,
      wholeWord: true,
    })
  })

  it("replaces previous results when options changed for the same query", () => {
    const store = createSearchBufferStore()
    const firstRunId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      matchMode: "literal",
      path: "repo",
      query: "needle",
    })
    store.getState().appendEvent(firstRunId, {
      match: {
        kind: "content",
        path: "repo/literal.ts",
        source: "disk",
        type: "file",
      },
      type: "match",
    })
    store.getState().appendEvent(firstRunId, {
      count: 1,
      path: "repo",
      query: "needle",
      truncated: false,
      type: "done",
    })

    store.getState().setSearchOptions("repo", { matchMode: "regex" })
    const secondRunId = store.getState().startSearch({
      includeContent: true,
      limit: 20,
      matchMode: "regex",
      path: "repo",
      query: "needle",
    })
    store.getState().appendEvent(secondRunId, {
      match: {
        kind: "content",
        path: "repo/regex.ts",
        source: "disk",
        type: "file",
      },
      type: "match",
    })

    expect(store.getState().active).toMatchObject({
      matches: [expect.objectContaining({ path: "repo/regex.ts" })],
      resultsQuery: "needle",
      resultsSearchQuery: expect.objectContaining({ matchMode: "regex" }),
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

  it("persists replace state across reruns and clears replace status on query changes", () => {
    const store = createSearchBufferStore()

    store.getState().prepareBuffer("repo")
    store.getState().setReplaceVisible("repo", true)
    store.getState().setReplaceText("repo", "pin")
    store.getState().finishReplace("repo", "1 match replaced.")
    store.getState().startSearch({
      includeContent: true,
      limit: 20,
      path: "repo",
      query: "needle",
    })

    expect(store.getState().active).toMatchObject({
      replaceMessage: "1 match replaced.",
      replaceStatus: "success",
      replaceText: "pin",
      replaceVisible: true,
    })

    store.getState().setQuery("repo", "other")

    expect(store.getState().active).toMatchObject({
      query: "other",
      replaceMessage: null,
      replaceStatus: "idle",
      replaceText: "pin",
      replaceVisible: true,
    })
  })

  it("requests a search refresh for the current query", () => {
    const store = createSearchBufferStore()
    store.getState().prepareBuffer("repo")
    store.getState().setQuery("repo", "needle")
    const before = store.getState().active?.searchRevision

    store.getState().requestSearchRefresh("repo")

    expect(store.getState().active).toMatchObject({
      query: "needle",
      searchRevision: (before ?? 0) + 1,
      status: "loading",
    })
  })
})
