import type { EditorSyntaxLanguageId, EditorToken } from "@editor/core";
import type { ResizablePaneHandleContext } from "@editor/panes";

export type DiffViewMode = "split" | "stacked";

export type DiffSplitPaneId = "old" | "new";

export type DiffSplitPaneLayout = Readonly<Record<DiffSplitPaneId, number>>;

export type DiffFileChangeType = "change" | "add" | "delete" | "rename" | "rename-change";

export type DiffLineType = "context" | "addition" | "deletion";

export type DiffRenderRowType =
  | "context"
  | "addition"
  | "deletion"
  | "placeholder"
  | "hunk"
  | "empty";

export type DiffInlineRange = {
  readonly start: number;
  readonly end: number;
};

export type DiffHunkLine = {
  readonly type: DiffLineType;
  readonly text: string;
  readonly oldLineNumber?: number;
  readonly newLineNumber?: number;
  readonly oldInlineRanges?: readonly DiffInlineRange[];
  readonly newInlineRanges?: readonly DiffInlineRange[];
};

export type DiffHunk = {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly header: string;
  readonly lines: readonly DiffHunkLine[];
};

export type DiffFile = {
  readonly path: string;
  readonly oldPath?: string;
  readonly newPath: string;
  readonly changeType: DiffFileChangeType;
  readonly oldObjectId?: string;
  readonly newObjectId?: string;
  readonly oldMode?: string;
  readonly newMode?: string;
  readonly oldLines: readonly string[];
  readonly newLines: readonly string[];
  readonly hunks: readonly DiffHunk[];
  readonly isPartial: boolean;
  readonly languageId?: EditorSyntaxLanguageId | null;
  readonly cacheKey?: string;
};

export type DiffTextFile = {
  readonly path: string;
  readonly text: string;
  readonly languageId?: EditorSyntaxLanguageId | null;
  readonly objectId?: string;
  readonly mode?: string;
};

export type CreateTextDiffOptions = {
  readonly oldFile?: DiffTextFile | null;
  readonly newFile?: DiffTextFile | null;
  readonly contextLines?: number;
  readonly ignoreWhitespace?: boolean;
};

export type ParseGitPatchOptions = {
  readonly cacheKey?: string;
};

export type DiffRenderRow = {
  readonly type: DiffRenderRowType;
  readonly text: string;
  readonly oldLineNumber?: number;
  readonly newLineNumber?: number;
  readonly hunkIndex?: number;
  readonly expanded?: boolean;
  readonly expandable?: boolean;
  readonly skippedLines?: number;
  readonly inlineRanges?: readonly DiffInlineRange[];
};

export type DiffSyntaxTokens = {
  readonly oldTokens?: readonly EditorToken[];
  readonly newTokens?: readonly EditorToken[];
};

export type DiffSplitHandleContext = ResizablePaneHandleContext & {
  readonly file: DiffFile;
};

export type DiffSplitPaneOptions = {
  readonly defaultLayout?: Partial<DiffSplitPaneLayout>;
  readonly minSize?: Partial<DiffSplitPaneLayout>;
  readonly maxSize?: Partial<DiffSplitPaneLayout>;
  readonly createHandle?: (context: DiffSplitHandleContext) => HTMLElement;
  readonly onLayoutChange?: (layout: DiffSplitPaneLayout, file: DiffFile) => void;
  readonly onLayoutChanged?: (layout: DiffSplitPaneLayout, file: DiffFile) => void;
  readonly disabled?: boolean;
};

export type DiffViewOptions = {
  readonly mode?: DiffViewMode;
  readonly lineHeight?: number;
  readonly tabSize?: number;
  readonly syntaxHighlight?: boolean;
  readonly theme?: string;
  readonly showFileList?: boolean;
  readonly splitPane?: DiffSplitPaneOptions;
};
