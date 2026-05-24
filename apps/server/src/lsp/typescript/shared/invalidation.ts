import path from 'node:path'

import type ts from 'typescript'
import type * as lsp from 'vscode-languageserver-protocol'

import { bumpScriptVersion, type ScriptVersionRegistry } from './script-versions'

export type InvalidationKind = 'file-content-change' | 'project-config-change'

export type InvalidationState = {
  bumpProjectVersion(): void

  readonly scriptVersions: ScriptVersionRegistry

  getLanguageService(): ts.LanguageService | null

  setLanguageService(service: ts.LanguageService | null): void
}

export function invalidateForFileContentChange(state: InvalidationState, fileName: string): void {
  state.bumpProjectVersion()
  bumpScriptVersion(state.scriptVersions, fileName)
}

export function invalidateForProjectConfigChange(state: InvalidationState): void {
  state.bumpProjectVersion()
  const current = state.getLanguageService()
  current?.dispose()
  state.setLanguageService(null)
}

export function classifyInvalidation(uri: lsp.DocumentUri): InvalidationKind {
  const basename = basenameForUri(uri)
  if (basename === null) return 'file-content-change'
  return isProjectConfigBasename(basename) ? 'project-config-change' : 'file-content-change'
}

function basenameForUri(uri: lsp.DocumentUri): string | null {
  try {
    const url = new URL(uri)
    const pathname = decodeURIComponent(url.pathname)
    const basename = path.posix.basename(pathname)
    return basename === '' ? null : basename
  } catch {
    return null
  }
}

function isProjectConfigBasename(basename: string): boolean {
  const lower = basename.toLowerCase()
  if (lower === 'package.json') return true
  if (lower === 'tsconfig.json' || lower === 'jsconfig.json') return true
  return /^(?:ts|js)config\.[^/\\]+\.json$/.test(lower)
}
