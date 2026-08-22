import ts from 'typescript-language-service'
import type * as lsp from 'vscode-languageserver-protocol'

import { documentText, lspPositionToOffset, textDocumentPosition } from '../shared/boundary'
import type { SessionContext } from '../shared/context'

export function handleCompletion(ctx: SessionContext, params: unknown): lsp.CompletionList {
  const request = textDocumentPosition(ctx, params)
  if (!request) return completionList([])

  const text = documentText(ctx, request.fileName)
  if (text === null) return completionList([])

  const offset = lspPositionToOffset(text, request.position)
  const completions = ctx.getLanguageService().getCompletionsAtPosition(request.fileName, offset, {
    includeCompletionsForModuleExports: true,
    includeCompletionsWithInsertText: true,
  })
  if (!completions) return completionList([])

  return completionList(completions.entries.map(completionItem))
}

function completionList(items: readonly lsp.CompletionItem[]): lsp.CompletionList {
  return { isIncomplete: false, items: Array.from(items) }
}

function completionItem(entry: ts.CompletionEntry): lsp.CompletionItem {
  return {
    label: entry.name,
    kind: completionItemKind(entry.kind),
    sortText: entry.sortText,
    insertText: entry.insertText,
    detail: entry.sourceDisplay ? ts.displayPartsToString(entry.sourceDisplay) : undefined,
  }
}

function completionItemKind(kind: string): lsp.CompletionItemKind {
  if (kind === ts.ScriptElementKind.classElement) return 7
  if (kind === ts.ScriptElementKind.interfaceElement) return 8
  if (kind === ts.ScriptElementKind.memberFunctionElement) return 2
  if (kind === ts.ScriptElementKind.functionElement) return 3
  if (kind === ts.ScriptElementKind.memberVariableElement) return 5
  if (kind === ts.ScriptElementKind.constElement) return 6
  if (kind === ts.ScriptElementKind.letElement) return 6
  if (kind === ts.ScriptElementKind.moduleElement) return 9
  if (kind === ts.ScriptElementKind.keyword) return 14
  return 1
}
