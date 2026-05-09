import ts from "typescript"
import type * as lsp from "vscode-languageserver-protocol"

import {
  documentText,
  lspPositionToOffset,
  rangeFromTextSpan,
  textDocumentPosition,
} from "../shared/boundary"
import type { SessionContext } from "../shared/context"

export function handleHover(
  ctx: SessionContext,
  params: unknown
): lsp.Hover | null {
  const request = textDocumentPosition(ctx, params)
  if (!request) return null

  const text = documentText(ctx, request.fileName)
  if (text === null) return null

  const service = ctx.getLanguageService()
  const offset = lspPositionToOffset(text, request.position)
  const quickInfo = service.getQuickInfoAtPosition(request.fileName, offset)
  if (!quickInfo) return null

  return hoverFromQuickInfo(text, quickInfo)
}

function hoverFromQuickInfo(text: string, quickInfo: ts.QuickInfo): lsp.Hover {
  const display = ts.displayPartsToString(quickInfo.displayParts ?? [])
  const documentation = ts.displayPartsToString(quickInfo.documentation ?? [])
  const tags = quickInfo.tags?.map(tagText).filter(Boolean) ?? []

  return {
    contents: {
      kind: "markdown",
      value: hoverMarkdown(display, documentation, tags),
    },
    range: rangeFromTextSpan(text, quickInfo.textSpan),
  }
}

function hoverMarkdown(
  display: string,
  documentation: string,
  tags: readonly string[]
): string {
  const sections: string[] = []
  if (display) sections.push(["```ts", display, "```"].join("\n"))
  if (documentation) sections.push(documentation)
  if (tags.length > 0) sections.push(tags.join("\n"))
  return sections.join("\n\n")
}

function tagText(tag: ts.JSDocTagInfo): string {
  const text = ts.displayPartsToString(tag.text ?? [])
  return text ? `@${tag.name} ${text}` : `@${tag.name}`
}
