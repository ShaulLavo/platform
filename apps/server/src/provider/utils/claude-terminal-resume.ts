import type { SessionId } from '@workspace/contracts'

export function claudeTerminalResumeArgv(
  sessionId: SessionId,
): readonly ['claude', '--resume', SessionId] {
  return ['claude', '--resume', sessionId]
}
