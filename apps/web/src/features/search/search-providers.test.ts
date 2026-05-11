import { describe, expect, it } from "bun:test"
import type {
  WorkspaceSearchEvent,
  WorkspaceSearchQuery,
} from "@workspace/contracts"

import {
  CompositeSearchProvider,
  DiskSearchProvider,
  OpenBufferSearchProvider,
  type SearchProvider,
} from "./search-providers"

const QUERY: WorkspaceSearchQuery = {
  entryType: "file",
  includeContent: true,
  limit: 20,
  path: "repo",
  query: "needle",
}

describe("open buffer search provider", () => {
  it("emits content matches from dirty editor text", async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: "repo/src/app.ts",
        text: "first\nconst needle = true",
      },
    ])

    const events = await collectEvents(provider.search(QUERY))

    expect(events).toContainEqual({
      match: expect.objectContaining({
        column: 7,
        endColumn: 13,
        line: 2,
        path: "repo/src/app.ts",
        source: "open-buffer",
      }),
      type: "match",
    })
    expect(events.at(-1)).toMatchObject({ count: 1, type: "done" })
  })

  it("emits every dirty editor match with exact ranges", async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: "repo/src/app.ts",
        text: "needle and needle",
      },
    ])

    const matches = (await collectEvents(provider.search(QUERY))).filter(
      (event) => event.type === "match"
    )

    expect(matches).toEqual([
      {
        match: expect.objectContaining({
          column: 1,
          endColumn: 7,
          source: "open-buffer",
        }),
        type: "match",
      },
      {
        match: expect.objectContaining({
          column: 12,
          endColumn: 18,
          source: "open-buffer",
        }),
        type: "match",
      },
    ])
  })

  it("keeps dirty long-line previews anchored around the match", async () => {
    const provider = new OpenBufferSearchProvider([
      {
        path: "repo/src/app.ts",
        text: `${"x".repeat(320)}needle`,
      },
    ])

    const events = await collectEvents(provider.search(QUERY))

    expect(events).toContainEqual({
      match: expect.objectContaining({
        column: 321,
        endColumn: 327,
        preview: expect.stringContaining("needle"),
        previewStartColumn: expect.any(Number),
      }),
      type: "match",
    })
  })
})

describe("disk search provider", () => {
  it("passes includeNames to the streaming search endpoint", async () => {
    const restoreFetch = stubFetchWithSseDone()
    const provider = new DiskSearchProvider()

    try {
      await collectEvents(provider.search({ ...QUERY, includeNames: false }))
      expect(lastFetchUrl()?.searchParams.get("includeNames")).toBe("false")
    } finally {
      restoreFetch()
    }
  })
})

describe("composite search provider", () => {
  it("suppresses disk content matches for dirty paths while keeping filenames", async () => {
    const disk = new StaticSearchProvider([
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
          kind: "name",
          path: "repo/src/app.ts",
          source: "disk",
          type: "file",
        },
        type: "match",
      },
      {
        count: 2,
        path: "repo",
        query: "needle",
        truncated: false,
        type: "done",
      },
    ])
    const provider = new CompositeSearchProvider({
      disk,
      openBufferPaths: new Set(["repo/src/app.ts"]),
      openBuffers: new OpenBufferSearchProvider([
        {
          path: "repo/src/app.ts",
          text: "needle from dirty editor",
        },
      ]),
    })

    const matches = (await collectEvents(provider.search(QUERY))).filter(
      (event) => event.type === "match"
    )

    expect(matches).toEqual([
      {
        match: expect.objectContaining({ source: "open-buffer" }),
        type: "match",
      },
      {
        match: expect.objectContaining({ kind: "name", source: "disk" }),
        type: "match",
      },
    ])
  })
})

class StaticSearchProvider implements SearchProvider {
  private events: readonly WorkspaceSearchEvent[]

  constructor(events: readonly WorkspaceSearchEvent[]) {
    this.events = events
  }

  async *search(): AsyncGenerator<WorkspaceSearchEvent> {
    for (const event of this.events) yield event
  }
}

async function collectEvents(events: AsyncIterable<WorkspaceSearchEvent>) {
  const result: WorkspaceSearchEvent[] = []
  for await (const event of events) result.push(event)

  return result
}

let fetchedUrl: URL | null = null

function lastFetchUrl() {
  return fetchedUrl
}

function stubFetchWithSseDone() {
  const originalFetch = globalThis.fetch
  fetchedUrl = null
  globalThis.fetch = async (input) => {
    fetchedUrl = new URL(String(input))
    return new Response(doneSse(), {
      headers: { "content-type": "text/event-stream" },
      status: 200,
    })
  }

  return () => {
    globalThis.fetch = originalFetch
    fetchedUrl = null
  }
}

function doneSse() {
  return [
    "event: done",
    `data: ${JSON.stringify({
      count: 0,
      path: "repo",
      query: "needle",
      truncated: false,
    })}`,
    "",
    "",
  ].join("\n")
}
