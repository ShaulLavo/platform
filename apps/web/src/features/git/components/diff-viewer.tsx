import {
  DiffView,
  annotateInlineChanges,
  type DiffFile,
  type DiffHunkLocation,
  type DiffHunkLine,
  type DiffSplitHandleContext,
} from '@editor/diff'
import '@editor/diff/style.css'
import './diff-viewer.css'
import { WarningCircleIcon } from '@phosphor-icons/react'
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type RefObject,
} from 'react'

import type { EditorDiffViewMode } from '@/features/editor/utils/diff-view-mode'
import { createEditorDiffSyntaxBackend } from '@/features/editor/editor-plugins'
import { languageIdForFilePath } from '@/features/editor/utils/file-path'
import { useWorkspaceFocus } from '@/components/workspace/workspace-focus-state'
import { useEditorColorTheme } from '@/features/editor/hooks/use-editor-color-theme'
import { errorMessage } from '@/lib/file-server'
import { displayPath } from '@/lib/path-formatters'
import type { DiffHunk as GitDiffHunk, FileDiff, LineChange } from '../types'

type GitDiffViewerProps = {
  diffs: readonly FileDiff[]
  error: unknown
  isError: boolean
  isPending: boolean
  mode: EditorDiffViewMode
  path: string
}

type TextDiffViewerProps = {
  detail?: string | null
  emptyMessage: string
  errorMessage?: string
  files: readonly DiffFile[]
  isError?: boolean
  isPending?: boolean
  mode: EditorDiffViewMode
}

type HunkRevealOptions = { readonly wrap?: boolean }

export type GitDiffViewerHandle = {
  getCurrentHunk: () => DiffHunkLocation | null
  revealHunk: (index: number) => boolean
  revealNextHunk: (options?: HunkRevealOptions) => boolean
  revealPreviousHunk: (options?: HunkRevealOptions) => boolean
}

export const GitDiffViewer = forwardRef<GitDiffViewerHandle, GitDiffViewerProps>(
  function GitDiffViewer({ diffs, error, isError, isPending, mode, path }, ref) {
    const diffFiles = useMemo(() => diffs.map(editorDiffFile), [diffs])

    return (
      <TextDiffViewer
        detail={errorMessage(error)}
        emptyMessage={`No git diff available for ${displayPath(path)}.`}
        errorMessage={`Git diff failed for ${displayPath(path)}.`}
        files={diffFiles}
        isError={isError}
        isPending={isPending}
        mode={mode}
        ref={ref}
      />
    )
  },
)

export const TextDiffViewer = forwardRef<GitDiffViewerHandle, TextDiffViewerProps>(
  function TextDiffViewer(
    {
      detail = null,
      emptyMessage,
      errorMessage: failedMessage = 'Diff failed.',
      files,
      isError = false,
      isPending = false,
      mode,
    },
    ref,
  ) {
    const viewRef = useRef<GitDiffViewerHandle | null>(null)

    useImperativeHandle(ref, () => diffViewerHandle(viewRef), [])

    if (files.some((file) => file.hunks.length > 0)) {
      return <EditorDiffView ref={viewRef} files={files} mode={mode} />
    }

    if (isPending) return null

    if (isError) {
      return <DiffState icon message={failedMessage} detail={detail ?? undefined} />
    }

    return <DiffState message={emptyMessage} />
  },
)

function diffViewerHandle(viewRef: RefObject<GitDiffViewerHandle | null>): GitDiffViewerHandle {
  return {
    getCurrentHunk: () => viewRef.current?.getCurrentHunk() ?? null,
    revealHunk: (index) => viewRef.current?.revealHunk(index) ?? false,
    revealNextHunk: (options) => viewRef.current?.revealNextHunk(options) ?? false,
    revealPreviousHunk: (options) => viewRef.current?.revealPreviousHunk(options) ?? false,
  }
}

const EditorDiffView = forwardRef<
  GitDiffViewerHandle,
  {
    files: readonly DiffFile[]
    mode: EditorDiffViewMode
  }
>(function EditorDiffView({ files, mode }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<DiffView | null>(null)
  const { editorTheme } = useEditorColorTheme()
  const active = useWorkspaceFocus((state) => state.activeArea === 'editor')
  const setFocusArea = useWorkspaceFocus((state) => state.setFocusArea)
  const syntaxBackend = useMemo(() => createEditorDiffSyntaxBackend(), [])

  useImperativeHandle(ref, () => diffViewHandle(viewRef), [])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new DiffView(host, {
      mode: 'split',
      showFileList: files.length > 1,
      splitPane: {
        createHandle: createGitDiffSplitHandle,
      },
      syntaxBackend,
      theme: editorTheme,
    })
    viewRef.current = view

    return () => {
      view.dispose()
      viewRef.current = null
    }
  }, [editorTheme, files.length, syntaxBackend])

  useLayoutEffect(() => {
    viewRef.current?.setMode(mode)
  }, [editorTheme, mode, syntaxBackend])

  useLayoutEffect(() => {
    viewRef.current?.setFiles([...files])
  }, [editorTheme, files, syntaxBackend])

  return (
    <div
      ref={hostRef}
      className='app-editor-host bg-background text-foreground flex h-full min-h-0 min-w-0 flex-1'
      data-editor-focus-active={active ? 'true' : 'false'}
      onFocusCapture={() => setFocusArea('editor')}
      onPointerDownCapture={() => setFocusArea('editor')}
      style={diffViewStyle}
    />
  )
})

function diffViewHandle(viewRef: RefObject<DiffView | null>): GitDiffViewerHandle {
  return {
    getCurrentHunk: () => viewRef.current?.getCurrentHunk() ?? null,
    revealHunk: (index) => viewRef.current?.revealHunk(index) ?? false,
    revealNextHunk: (options) => viewRef.current?.revealNextHunk(options) ?? false,
    revealPreviousHunk: (options) => viewRef.current?.revealPreviousHunk(options) ?? false,
  }
}

const diffViewStyle = {
  '--editor-background': 'var(--background)',
  '--editor-foreground': 'var(--foreground)',
  '--editor-gutter-background': 'var(--background)',
  '--editor-gutter-foreground': 'var(--muted-foreground)',
  '--editor-diff-background': 'var(--background)',
  '--editor-diff-border': 'var(--border)',
  '--editor-diff-foreground': 'var(--foreground)',
  '--editor-diff-gutter-background': 'var(--background)',
  '--editor-diff-gutter-foreground': 'var(--muted-foreground)',
} as CSSProperties

function createGitDiffSplitHandle({ document }: DiffSplitHandleContext): HTMLElement {
  const handle = document.createElement('div')
  const line = document.createElement('span')
  handle.className = 'app-git-diff-split-handle'
  handle.style.cursor = 'ew-resize'
  handle.style.width = '1px'
  line.className = 'app-git-diff-split-handle-line'
  line.setAttribute('aria-hidden', 'true')
  handle.appendChild(line)
  return handle
}

function DiffState({
  detail,
  icon = false,
  message,
}: {
  detail?: string
  icon?: boolean
  message: string
}) {
  return (
    <div className='text-muted-foreground flex min-h-0 items-center justify-center p-6 text-xs'>
      {icon ? <WarningCircleIcon className='mr-2 size-4' /> : null}
      <span>{message}</span>
      {detail ? <span className='text-destructive ml-2'>{detail}</span> : null}
    </div>
  )
}

function editorDiffFile(diff: FileDiff): DiffFile {
  const oldPath = diff.oldPath ?? diff.path
  const languageId = languageIdForFilePath(diff.path)
  const oldLines = textLines(diff.oldText) ?? collectLines(diff.hunks, 'old')
  const newLines = textLines(diff.newText) ?? collectLines(diff.hunks, 'new')

  return {
    changeType: 'change',
    hunks: diff.hunks.map(editorDiffHunk),
    isPartial: diff.oldText === undefined || diff.newText === undefined,
    languageId,
    newLines,
    newPath: diff.path,
    oldLines,
    oldPath,
    path: diff.path,
  }
}

function editorDiffHunk(hunk: GitDiffHunk) {
  return {
    header: hunk.header,
    lines: annotateInlineChanges(hunk.changes.map(editorDiffLine)),
    newLines: hunk.newLines,
    newStart: hunk.newStart,
    oldLines: hunk.oldLines,
    oldStart: hunk.oldStart,
  }
}

function editorDiffLine(change: LineChange): DiffHunkLine {
  if (change.type === 'added') {
    return {
      newLineNumber: change.newLine ?? undefined,
      text: change.text,
      type: 'addition',
    }
  }

  if (change.type === 'deleted') {
    return {
      oldLineNumber: change.oldLine ?? undefined,
      text: change.text,
      type: 'deletion',
    }
  }

  return {
    newLineNumber: change.newLine ?? undefined,
    oldLineNumber: change.oldLine ?? undefined,
    text: change.text,
    type: 'context',
  }
}

function collectLines(hunks: readonly GitDiffHunk[], side: 'old' | 'new') {
  const lines: string[] = []

  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      if (side === 'old' && change.type === 'added') continue
      if (side === 'new' && change.type === 'deleted') continue

      lines.push(change.text)
    }
  }

  return lines
}

function textLines(text: string | undefined) {
  if (text === undefined) return null
  if (text.length === 0) return []

  return text.split('\n')
}
