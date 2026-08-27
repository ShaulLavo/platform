import type { DiffLanguageHost } from '@/features/editor/utils/diff-language-context'

export const testDiffLanguageHost: DiffLanguageHost = {
  applyWorkspaceEdit: async () => ({
    code: 'workspace-edit-host-unavailable',
    message: 'Workspace edits are unavailable in this diff test',
    status: 'failed',
  }),
  openDefinition: () => false,
}
