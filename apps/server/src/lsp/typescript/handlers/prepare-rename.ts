import type * as lsp from 'vscode-languageserver-protocol'

import {
  documentText,
  lspPositionToOffset,
  rangeFromTextSpan,
  textDocumentPosition,
} from '../shared/boundary'
import type { SessionContext } from '../shared/context'

export function handlePrepareRename(
  ctx: SessionContext,
  params: unknown,
): lsp.Range | { range: lsp.Range; placeholder: string } | null {
  const request = textDocumentPosition(ctx, params)
  if (!request) return null

  const text = documentText(ctx, request.fileName)
  if (text === null) return null

  const offset = lspPositionToOffset(text, request.position)
  const info = ctx.getLanguageService().getRenameInfo(request.fileName, offset, {})
  if (!info.canRename) return null

  return {
    range: rangeFromTextSpan(text, info.triggerSpan),
    placeholder: info.displayName,
  }
}
