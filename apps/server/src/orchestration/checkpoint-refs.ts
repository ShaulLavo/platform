export function checkpointRefForSessionTurn(sessionId: string, turnCount: number) {
  const encodedSessionId = Buffer.from(sessionId).toString('base64url')

  return `refs/platform/checkpoints/${encodedSessionId}/turn/${turnCount}`
}
