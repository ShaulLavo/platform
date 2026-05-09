import type { EditorGutterContribution, EditorGutterRowContext } from "@editor/core";
import type { DiffRenderRow } from "./types";

export type DiffGutterSide = "old" | "new" | "stacked";

export function createDiffGutterContribution(
  side: DiffGutterSide,
  getRows: () => readonly DiffRenderRow[],
): EditorGutterContribution {
  return {
    id: `diff-${side}-gutter`,
    className: "editor-diff-gutter-cell",
    createCell(document) {
      return createDiffGutterCell(document);
    },
    width(context) {
      const digits = Math.max(2, String(Math.max(1, context.lineCount)).length);
      return Math.ceil(digits * context.metrics.characterWidth + 30);
    },
    updateCell(element, context) {
      updateDiffGutterCell(element, context, getRows()[context.bufferRow], side);
    },
  };
}

function createDiffGutterCell(document: Document): HTMLElement {
  const element = document.createElement("span");
  const indicator = document.createElement("span");
  const number = document.createElement("span");

  element.className = "editor-diff-gutter";
  indicator.className = "editor-diff-gutter-indicator";
  number.className = "editor-diff-gutter-number";
  element.append(indicator, number);
  return element;
}

function updateDiffGutterCell(
  element: HTMLElement,
  context: EditorGutterRowContext,
  row: DiffRenderRow | undefined,
  side: DiffGutterSide,
): void {
  const indicator = element.querySelector(".editor-diff-gutter-indicator");
  const number = element.querySelector(".editor-diff-gutter-number");
  if (!row || !indicator || !number) return;

  element.dataset.diffRowType = row.type;
  indicator.textContent = indicatorForRow(row, side);
  number.textContent = lineNumberForRow(row, side);
  element.toggleAttribute("data-primary-text-row", context.primaryText);
}

function indicatorForRow(row: DiffRenderRow, side: DiffGutterSide): string {
  if (row.type === "addition" && side !== "old") return "+";
  if (row.type === "deletion" && side !== "new") return "-";
  return "";
}

function lineNumberForRow(row: DiffRenderRow, side: DiffGutterSide): string {
  if (row.type === "hunk" || row.type === "empty") return "";
  if (side === "old") return formatLineNumber(row.oldLineNumber);
  if (side === "new") return formatLineNumber(row.newLineNumber);
  return formatStackedLineNumber(row);
}

function formatStackedLineNumber(row: DiffRenderRow): string {
  const oldNumber = formatLineNumber(row.oldLineNumber);
  const newNumber = formatLineNumber(row.newLineNumber);
  if (oldNumber && newNumber) return `${oldNumber}/${newNumber}`;
  return oldNumber || newNumber;
}

function formatLineNumber(value: number | undefined): string {
  if (value === undefined) return "";
  return String(value);
}
