import ts from 'typescript'
import type * as lsp from 'vscode-languageserver-protocol'

import { documentText, lspPositionToOffset, textDocumentPosition } from '../shared/boundary'
import type { SessionContext } from '../shared/context'

export function handleSignatureHelp(
  ctx: SessionContext,
  params: unknown,
): lsp.SignatureHelp | null {
  const request = textDocumentPosition(ctx, params)
  if (!request) return null

  const text = documentText(ctx, request.fileName)
  if (text === null) return null

  const offset = lspPositionToOffset(text, request.position)
  const help = ctx.getLanguageService().getSignatureHelpItems(request.fileName, offset, undefined)
  if (!help) return null

  return signatureHelp(help)
}

function signatureHelp(help: ts.SignatureHelpItems): lsp.SignatureHelp {
  return {
    activeParameter: help.argumentIndex,
    activeSignature: help.selectedItemIndex,
    signatures: help.items.map(signatureInformation),
  }
}

function signatureInformation(item: ts.SignatureHelpItem): lsp.SignatureInformation {
  return {
    label: signatureLabel(item),
    documentation: ts.displayPartsToString(item.documentation),
    parameters: item.parameters.map((parameter) => ({
      label: ts.displayPartsToString(parameter.displayParts),
      documentation: ts.displayPartsToString(parameter.documentation),
    })),
  }
}

function signatureLabel(item: ts.SignatureHelpItem): string {
  const prefix = ts.displayPartsToString(item.prefixDisplayParts)
  const suffix = ts.displayPartsToString(item.suffixDisplayParts)
  const separator = ts.displayPartsToString(item.separatorDisplayParts)
  const parameters = item.parameters.map((parameter) =>
    ts.displayPartsToString(parameter.displayParts),
  )
  return `${prefix}${parameters.join(separator)}${suffix}`
}
