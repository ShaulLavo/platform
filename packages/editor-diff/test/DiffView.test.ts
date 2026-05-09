import { beforeAll, describe, expect, it, vi } from "vitest";
import { createTextDiff, DiffView } from "../src";
import type { DiffFile, DiffSplitHandleContext, DiffSplitPaneOptions } from "../src";

beforeAll(() => {
  installHighlightPolyfill();
});

describe("DiffView split panes", () => {
  it("renders a resizable handle between old and new panes", () => {
    const { container } = renderDiffView();
    const split = querySplit(container);
    const children = Array.from(split.children);
    const handle = children[1] as HTMLElement | undefined;

    expect(children).toHaveLength(3);
    expect(children[0]?.classList.contains("editor-diff-pane-old")).toBe(true);
    expect(handle?.matches("[data-editor-pane-handle]")).toBe(true);
    expect(handle?.getAttribute("role")).toBe("separator");
    expect(children[2]?.classList.contains("editor-diff-pane-new")).toBe(true);
  });

  it("mounts custom split handles with file-aware context", () => {
    const createHandle = vi.fn((context: DiffSplitHandleContext) => {
      const handle = context.document.createElement("div");
      handle.className = "custom-diff-handle";
      return handle;
    });
    const { container } = renderDiffView({ createHandle });

    expect(createHandle).toHaveBeenCalledWith(
      expect.objectContaining({
        beforePaneId: "old",
        afterPaneId: "new",
        file: expect.objectContaining({ path: "note.txt" }),
        orientation: "horizontal",
      }),
    );
    expect(container.querySelector(".custom-diff-handle")).not.toBeNull();
    expect(container.querySelector(".editor-diff-split-handle")).toBeNull();
  });

  it("removes the handle when switching to stacked mode", () => {
    const { container, diffView } = renderDiffView();

    expect(container.querySelector("[data-editor-pane-handle]")).not.toBeNull();

    diffView.setMode("stacked");

    expect(container.querySelector("[data-editor-pane-handle]")).toBeNull();
    expect(container.querySelector(".editor-diff-split")).toBeNull();
    expect(container.querySelector(".editor-diff-pane-stacked")).not.toBeNull();
  });

  it("reveals next and previous hunks with wrapping", () => {
    const { diffView } = renderDiffView({ file: multiHunkDiff() });

    expect(diffView.getCurrentHunk()?.index).toBe(0);
    expect(diffView.revealNextHunk()).toBe(true);
    expect(diffView.getCurrentHunk()?.index).toBe(1);
    expect(diffView.revealNextHunk()).toBe(false);
    expect(diffView.revealNextHunk({ wrap: true })).toBe(true);
    expect(diffView.getCurrentHunk()?.index).toBe(0);
    expect(diffView.revealPreviousHunk({ wrap: true })).toBe(true);
    expect(diffView.getCurrentHunk()?.index).toBe(1);
  });
});

type RenderDiffViewOptions = {
  readonly createHandle?: DiffSplitPaneOptions["createHandle"];
  readonly file?: DiffFile;
};

function renderDiffView(options: RenderDiffViewOptions = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const diffView = new DiffView(container, {
    showFileList: false,
    splitPane: {
      createHandle: options.createHandle,
    },
    syntaxHighlight: false,
  });
  diffView.setFiles([options.file ?? singleHunkDiff()]);
  return { container, diffView };
}

function singleHunkDiff() {
  return createTextDiff({
    oldFile: { path: "note.txt", text: "one\ntwo\n" },
    newFile: { path: "note.txt", text: "one\nTWO\n" },
  });
}

function multiHunkDiff() {
  return createTextDiff({
    contextLines: 0,
    oldFile: { path: "note.txt", text: "one\ntwo\nthree\nfour\nfive\nsix\n" },
    newFile: { path: "note.txt", text: "ONE\ntwo\nthree\nFOUR\nfive\nsix\n" },
  });
}

function querySplit(container: HTMLElement): HTMLElement {
  const split = container.querySelector<HTMLElement>(".editor-diff-split");
  if (!split) throw new Error("Expected split diff");
  return split;
}

type HighlightConstructor = new (...ranges: AbstractRange[]) => Highlight;

class TestHighlight {
  private readonly ranges = new Set<AbstractRange>();

  public constructor(...ranges: AbstractRange[]) {
    for (const range of ranges) this.ranges.add(range);
  }

  public add(range: AbstractRange): this {
    this.ranges.add(range);
    return this;
  }

  public clear(): void {
    this.ranges.clear();
  }

  public delete(range: AbstractRange): boolean {
    return this.ranges.delete(range);
  }
}

function installHighlightPolyfill(): void {
  const global = globalThis as typeof globalThis & {
    Highlight?: HighlightConstructor;
  };
  if (global.Highlight) return;
  global.Highlight = TestHighlight as unknown as HighlightConstructor;
}
