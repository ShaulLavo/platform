let workspaceOpenGeneration = 0

export function claimWorkspaceOpenGeneration() {
  workspaceOpenGeneration = Math.max(Date.now(), workspaceOpenGeneration + 1)
  return workspaceOpenGeneration
}
