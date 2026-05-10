import { describe, expect, it } from "vitest";
import type { EditorGutterWidthContext } from "@editor/core";
import { createDiffGutterContribution } from "../src/gutters";
import type { DiffRenderRow } from "../src";

describe("diff gutters", () => {
  it("reserves width for stacked old/new line numbers", () => {
    const contribution = createDiffGutterContribution("stacked", () => [
      lineRow({ oldLineNumber: 999, newLineNumber: 1001 }),
    ]);

    expect(contribution.width(widthContext())).toBe(94);
  });

  it("reserves width from sparse source line numbers", () => {
    const contribution = createDiffGutterContribution("new", () => [
      lineRow({ newLineNumber: 12345 }),
    ]);

    expect(contribution.width(widthContext())).toBe(70);
  });
});

function lineRow(
  lineNumbers: Pick<DiffRenderRow, "oldLineNumber" | "newLineNumber">,
): DiffRenderRow {
  return {
    type: "context",
    text: "content",
    ...lineNumbers,
  };
}

function widthContext(): EditorGutterWidthContext {
  return {
    lineCount: 1,
    metrics: {
      characterWidth: 8,
      rowHeight: 20,
    },
  };
}
