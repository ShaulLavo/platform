export function checkpointRefForThreadTurn(threadId: string, turnCount: number) {
  const encodedThreadId = Buffer.from(threadId).toString('base64url')

  return `refs/t3/checkpoints/${encodedThreadId}/turn/${turnCount}`
}
