import { describe, expect, it } from "bun:test"

import { FsError, errorPayload, mapNodeError } from "./errors"

describe("FsError", () => {
  it("maps common Node filesystem errors while preserving the original cause", () => {
    const cause = Object.assign(new Error("missing"), { code: "ENOENT" })
    const error = mapNodeError(cause)

    expect(error.code).toBe("NOT_FOUND")
    expect(error.statusCode).toBe(404)
    expect(error.cause).toBe(cause)
  })

  it("keeps public error payloads stable", () => {
    const error = new FsError("OPERATION_FAILED", "failed internally", {
      detail: "private",
    })

    expect(errorPayload(error)).toEqual({
      error: {
        code: "OPERATION_FAILED",
        message: "failed internally",
      },
    })
  })
})
