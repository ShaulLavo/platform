import { describe, expect, it } from "vitest";
import {
  createSplitProjection,
  createStackedProjection,
  createTextDiff,
  parseGitPatch,
} from "../src";

describe("createTextDiff", () => {
  it("creates hunks for modified files", () => {
    const diff = createTextDiff({
      oldFile: { path: "note.txt", text: "alpha\nbeta\ngamma\n" },
      newFile: { path: "note.txt", text: "alpha\nBETA\ngamma\n" },
    });

    expect(diff.changeType).toBe("change");
    expect(diff.isPartial).toBe(false);
    expect(diff.hunks).toHaveLength(1);
    expect(diff.hunks[0]?.lines.some((line) => line.type === "deletion")).toBe(true);
    expect(diff.hunks[0]?.lines.some((line) => line.type === "addition")).toBe(true);
  });

  it("handles empty files without fake content lines", () => {
    const diff = createTextDiff({
      oldFile: { path: "empty.txt", text: "" },
      newFile: { path: "empty.txt", text: "" },
    });

    expect(diff.oldLines).toEqual([]);
    expect(diff.newLines).toEqual([]);
    expect(diff.hunks).toEqual([]);
  });

  it("marks added and deleted files", () => {
    const added = createTextDiff({
      oldFile: null,
      newFile: { path: "created.ts", text: "export {}\n" },
    });
    const deleted = createTextDiff({
      oldFile: { path: "removed.ts", text: "export {}\n" },
      newFile: null,
    });

    expect(added.changeType).toBe("add");
    expect(deleted.changeType).toBe("delete");
  });

  it("tracks trailing newline changes", () => {
    const diff = createTextDiff({
      oldFile: { path: "note.txt", text: "alpha" },
      newFile: { path: "note.txt", text: "alpha\n" },
    });

    expect(diff.hunks).toHaveLength(1);
    expect(diff.newLines).toEqual(["alpha", ""]);
  });

  it("can ignore whitespace-only changes", () => {
    const diff = createTextDiff({
      oldFile: { path: "note.txt", text: "alpha\n" },
      newFile: { path: "note.txt", text: "  alpha\n" },
      ignoreWhitespace: true,
    });

    expect(diff.hunks).toEqual([]);
  });
});

describe("parseGitPatch", () => {
  it("parses multi-file git patches and metadata", () => {
    const files = parseGitPatch(
      [
        "diff --git a/a.txt b/a.txt",
        "index 1111111..2222222 100644",
        "--- a/a.txt",
        "+++ b/a.txt",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "diff --git a/old.txt b/new.txt",
        "similarity index 88%",
        "rename from old.txt",
        "rename to new.txt",
        "index 3333333..4444444 100644",
        "--- a/old.txt",
        "+++ b/new.txt",
        "@@ -1 +1 @@",
        "-before",
        "+after",
      ].join("\n"),
      { cacheKey: "patch" },
    );

    expect(files).toHaveLength(2);
    expect(files[0]).toMatchObject({
      path: "a.txt",
      oldObjectId: "1111111",
      newObjectId: "2222222",
      oldMode: "100644",
      newMode: "100644",
      cacheKey: "patch-0",
    });
    expect(files[1]).toMatchObject({
      path: "new.txt",
      oldPath: "old.txt",
      newPath: "new.txt",
      changeType: "rename-change",
      cacheKey: "patch-1",
    });
  });

  it("preserves added and deleted file status", () => {
    const files = parseGitPatch(
      [
        "diff --git a/new.txt b/new.txt",
        "new file mode 100644",
        "index 0000000..1111111",
        "--- /dev/null",
        "+++ b/new.txt",
        "@@ -0,0 +1 @@",
        "+created",
        "diff --git a/deleted.txt b/deleted.txt",
        "deleted file mode 100644",
        "index 2222222..0000000",
        "--- a/deleted.txt",
        "+++ /dev/null",
        "@@ -1 +0,0 @@",
        "-removed",
      ].join("\n"),
    );

    expect(files.map((file) => file.changeType)).toEqual(["add", "delete"]);
  });

  it("drops raw hunk headers if malformed patch text repeats them in hunk bodies", () => {
    const files = parseGitPatch(
      [
        "diff --git a/note.txt b/note.txt",
        "index 1111111..2222222 100644",
        "--- a/note.txt",
        "+++ b/note.txt",
        "@@ -3,2 +3,2 @@",
        "@@ -3,2 +3,2 @@",
        " line",
        "-old",
        "+new",
      ].join("\n"),
    );

    expect(files[0]?.hunks[0]?.lines.some((line) => line.text.includes("@@"))).toBe(false);
  });

  it("returns an empty list for malformed patch text", () => {
    expect(parseGitPatch("not a patch")).toEqual([]);
  });
});

describe("diff projections", () => {
  it("aligns split replacement rows with placeholders", () => {
    const file = createTextDiff({
      oldFile: { path: "note.txt", text: "one\ntwo\nthree\n" },
      newFile: { path: "note.txt", text: "one\nTWO\nTHREE\nfour\n" },
    });
    const projection = createSplitProjection(file);

    expect(projection.leftRows.some((row) => row.type === "placeholder")).toBe(true);
    expect(projection.leftRows).toHaveLength(projection.rightRows.length);
    expect(projection.leftRows.some((row) => (row.inlineRanges?.length ?? 0) > 0)).toBe(true);
  });

  it("creates stacked rows in display order", () => {
    const file = createTextDiff({
      oldFile: { path: "note.txt", text: "old\n" },
      newFile: { path: "note.txt", text: "new\n" },
    });
    const projection = createStackedProjection(file);

    expect(projection.rows.map((row) => row.type)).toContain("deletion");
    expect(projection.rows.map((row) => row.type)).toContain("addition");
  });

  it("uses line-info hunk separators instead of raw patch headers", () => {
    const file = createTextDiff({
      oldFile: { path: "note.txt", text: "one\ntwo\nthree\nfour\nfive\n" },
      newFile: { path: "note.txt", text: "one\ntwo\nTHREE\nfour\nfive\n" },
      contextLines: 0,
    });
    const projection = createStackedProjection(file);
    const separator = projection.rows.find((row) => row.type === "hunk");

    expect(separator?.text).toBe("2 unmodified lines");
    expect(projection.rows.some((row) => row.text.startsWith("@@"))).toBe(false);
  });

  it("does not render raw hunk headers if they appear in parsed line content", () => {
    const projection = createStackedProjection({
      path: "note.patch",
      oldPath: "note.patch",
      newPath: "note.patch",
      changeType: "change",
      oldLines: ["@@ -255,6 +261,20 @@"],
      newLines: ["@@ -255,6 +261,20 @@"],
      hunks: [
        {
          oldStart: 255,
          oldLines: 1,
          newStart: 261,
          newLines: 1,
          header: "@@ -255,6 +261,20 @@",
          lines: [
            {
              type: "context",
              text: "@@ -255,6 +261,20 @@",
              oldLineNumber: 255,
              newLineNumber: 261,
            },
          ],
        },
      ],
      isPartial: true,
      languageId: null,
    });

    expect(projection.rows.some((row) => row.text.includes("@@ -255"))).toBe(false);
  });
});
