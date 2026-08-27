import type { LanguageServerDefinitionTarget, OnApplyWorkspaceEdit } from '@singapor/lsp-plugin'

export type DiffLanguageHost = {
  readonly applyWorkspaceEdit: OnApplyWorkspaceEdit
  readonly openDefinition: ((target: LanguageServerDefinitionTarget) => void | boolean) | null
}

export type DiffLanguageServerContext = {
  /** The absolute file path and URI identity known by the language server. */
  readonly documentPath: string | null
  readonly host: DiffLanguageHost
  /** Whether the new side is the file on disk, and may use its real URI. */
  readonly newSideIsWorkingTree: boolean
  /** The current text held by the live editor owning this path, if one exists. */
  readonly ownedText: string | null
  readonly rootPath: string
}
