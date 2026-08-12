export function checkpointRefForThreadTurn(threadId: string, turnCount: number) {
  const encodedThreadId = Buffer.from(threadId).toString('base64url')

  return `refs/platform/checkpoints/${encodedThreadId}/turn/${turnCount}`
}
