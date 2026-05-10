import type { EditorGutterContribution, EditorGutterRowContext } from "@editor/core";
import type { DiffRenderRow } from "./types";

export type DiffGutterSide = "old" | "new" | "stacked";

const MIN_LINE_NUMBER_DIGITS = 2;
const GUTTER_RESERVED_WIDTH = 30;

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
      const characters = maxLineNumberCharacters(side, getRows(), context.lineCount);
      return Math.ceil(characters * context.metrics.characterWidth + GUTTER_RESERVED_WIDTH);
    },
    updateCell(element, context) {
      updateDiffGutterCell(element, context, getRows()[context.bufferRow], side);
    },
  };
}

function maxLineNumberCharacters(
  side: DiffGutterSide,
  rows: readonly DiffRenderRow[],
  lineCount: number,
): number {
  let maxCharacters = String(Math.max(1, lineCount)).length;
  for (const row of rows) {
    maxCharacters = Math.max(maxCharacters, lineNumberForRow(row, side).length);
  }

  return Math.max(MIN_LINE_NUMBER_DIGITS, maxCharacters);
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
  if (row.type === "hunk" && row.expandable) return row.expanded ? "−" : "+";
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
