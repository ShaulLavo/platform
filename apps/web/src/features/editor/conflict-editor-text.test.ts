import { describe, expect, it } from "bun:test"

import { conflictEditorText } from "./conflict-editor-text"

describe("conflictEditorText", () => {
  it("wraps only changed rows in conflict markers", () => {
    const text = conflictEditorText({
      eventType: "changed",
      localPath: "/repo/app.ts",
      localText: "const a = 1\nconst value = 'local'\nconst z = 3\n",
      remotePath: "/repo/app.ts",
      remoteText: "const a = 1\nconst value = 'remote'\nconst z = 3\n",
    })

    expect(text).toBe(
      "const a = 1\n" +
        "<<<<<<< Local: /repo/app.ts\n" +
        "const value = 'local'\n" +
        "=======\n" +
        "const value = 'remote'\n" +
        ">>>>>>> Remote: /repo/app.ts\n" +
        "const z = 3\n"
    )
  })

  it("keeps inserted remote rows scoped to the insertion point", () => {
    const text = conflictEditorText({
      eventType: "changed",
      localPath: "/repo/app.ts",
      localText: "before\nafter\n",
      remotePath: "/repo/app.ts",
      remoteText: "before\nremote insert\nafter\n",
    })

    expect(text).toBe(
      "before\n" +
        "<<<<<<< Local: /repo/app.ts\n" +
        "=======\n" +
        "remote insert\n" +
        ">>>>>>> Remote: /repo/app.ts\n" +
        "after\n"
    )
  })

  it("uses a whole-file conflict for deleted remote files", () => {
    const text = conflictEditorText({
      eventType: "deleted",
      localPath: "/repo/app.ts",
      localText: "local content",
      remotePath: "/repo/app.ts",
      remoteText: null,
    })

    expect(text).toBe(
      "<<<<<<< Local: /repo/app.ts\n" +
        "local content\n" +
        "=======\n" +
        ">>>>>>> Remote: /repo/app.ts\n"
    )
  })
})
