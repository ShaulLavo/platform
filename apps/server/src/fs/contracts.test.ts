import { describe, expect, it } from "bun:test"
import * as v from "valibot"

import {
  booleanQueryValueSchema,
  findQuerySchema,
  treeEntrySchema,
  treeQuerySchema,
} from "./contracts"

describe("filesystem contracts", () => {
  it("parses query booleans and clamps bounded integer query values", () => {
    expect(v.parse(booleanQueryValueSchema, "true")).toBe(true)
    expect(v.parse(booleanQueryValueSchema, "0")).toBe(false)
    expect(v.parse(treeQuerySchema, { depth: "99", path: "src" })).toEqual({
      depth: 10,
      path: "src",
    })
  })

  it("parses find queries with defaults", () => {
    expect(v.parse(findQuerySchema, { query: "button" })).toEqual({
      includeContent: false,
      limit: 50,
      path: "",
      query: "button",
    })
  })

  it("validates shared tree entry shape", () => {
    expect(
      v.parse(treeEntrySchema, {
        birthtimeMs: 1,
        mtimeMs: 2,
        name: "index.ts",
        path: "src/index.ts",
        size: 42,
        type: "file",
      })
    ).toEqual({
      birthtimeMs: 1,
      mtimeMs: 2,
      name: "index.ts",
      path: "src/index.ts",
      size: 42,
      type: "file",
    })
  })
})
