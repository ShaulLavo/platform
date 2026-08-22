import type ts from 'typescript-language-service'

import { bumpScriptVersion, type ScriptVersionRegistry } from './script-versions'

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
