export { DiffView } from "./DiffView";
export { createTextDiff, parseGitPatch } from "./model";
export { createSplitProjection, createStackedProjection } from "./projection";
export type {
  CreateTextDiffOptions,
  DiffFile,
  DiffFileChangeType,
  DiffHunk,
  DiffHunkLine,
  DiffInlineRange,
  DiffLineType,
  DiffRenderRow,
  DiffRenderRowType,
  DiffSyntaxTokens,
  DiffTextFile,
  DiffViewMode,
  DiffViewOptions,
  ParseGitPatchOptions,
} from "./types";
