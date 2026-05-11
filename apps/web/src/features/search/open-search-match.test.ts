import { describe, expect, it } from "bun:test"
import type { TypeScriptLspDefinitionTarget } from "@editor/typescript-lsp"

import { openWorkspaceSearchMatch } from "./open-search-match"

describe("openWorkspaceSearchMatch", () => {
  it("opens content matches at zero-based editor ranges", () => {
    let opened: TypeScriptLspDefinitionTarget | null = null

    openWorkspaceSearchMatch(
      {
        column: 7,
        endColumn: 13,
        kind: "content",
        line: 3,
        path: "repo/src/app.ts",
        source: "disk",
        type: "file",
      },
      "needle",
      {
        openDefinition: (target) => {
          opened = target
          return true
        },
        selectFile: () => {},
      }
    )

    expect(opened).toMatchObject({
      path: "repo/src/app.ts",
      range: {
        end: { character: 12, line: 2 },
        start: { character: 6, line: 2 },
      },
    })
  })
})
