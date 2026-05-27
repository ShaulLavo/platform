import { EditorStatusCharCount } from '@/features/editor/components/editor-status-char-count'
import { EditorStatusCursor } from '@/features/editor/components/editor-status-cursor'
import { EditorStatusFilePath } from '@/features/editor/components/editor-status-file-path'
import { EditorStatusHistory } from '@/features/editor/components/editor-status-history'
import { EditorStatusLanguageServer } from '@/features/editor/components/editor-status-language-server'
import { EditorStatusSyntax } from '@/features/editor/components/editor-status-syntax'
import type { EditorStatusBarSource } from '@/features/editor/state/editor-status-bar-source'

type EditorStatusBarContentProps = {
  source: EditorStatusBarSource
}

export function EditorStatusBarContent({ source }: EditorStatusBarContentProps) {
  return (
    <>
      <EditorStatusFilePath filePath={source.filePath} />
      <EditorStatusCursor controller={source.controller} />
      <EditorStatusCharCount controller={source.controller} />
      <EditorStatusSyntax controller={source.controller} />
      <EditorStatusLanguageServer source={source.languageServerStatusSource} />
      <EditorStatusHistory controller={source.controller} />
    </>
  )
}
